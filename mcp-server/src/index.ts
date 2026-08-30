/**
 * recoup-actions-mcp
 * ------------------
 * A minimal, stateless, remote MCP server (Streamable HTTP transport) that TrueForge
 * connects to like any catalog server — via Settings → Connectors → "Add MCP Server".
 *
 * Why this exists: the shipped Stripe / Linear MCP servers expose Stripe's and Linear's
 * full, generic APIs. For the Recoup agent we want two high-level, batch-shaped write
 * actions the harness can gate behind a single human approval, plus four read-only tools
 * (dunning policy, customer LTV, customer discovery, account usage — all scoped by
 * company_id, since Recoup runs recovery for multiple tenant companies, not one).
 * Building this ourselves (rather than composing raw Stripe/Linear calls in a loop)
 * means:
 *
 *   1. ONE approval per batch, not one per charge — TrueForge does not yet support
 *      "approve once" for repeated calls (see /roadmap), so a tool that takes an array
 *      of IDs and loops internally is the difference between one Allow/Deny prompt and
 *      a dozen of them mid-demo.
 *   2. Tool annotations we control precisely — `destructiveHint` / `readOnlyHint` decide
 *      whether TrueForge's default `require_approval_for_tools: ["@write","@destructive"]`
 *      policy gates a tool at all (see toolSelectors.ts in the TrueForge source: unannotated
 *      tools are exempt from @write/@destructive unless *named explicitly*). We annotate
 *      AND we recommend listing the tool names explicitly in the agent spec — belt and
 *      suspenders. See agent-spec.json in this kit.
 *
 * Auth: TrueForge's "header auth" sends a static header on every request. This server
 * expects `Authorization: Bearer <MCP_SERVER_TOKEN>`.
 *
 * Safety default: DRY_RUN=true (default). No real Stripe retry or Linear ticket is created
 * until a team member deliberately sets DRY_RUN=false and supplies real API keys. Keep it
 * on `true` for rehearsals; flip it only for the live/recorded demo run against TEST-mode
 * Stripe keys. Never point this at a live Stripe key.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Pool } from "pg";
import { z } from "zod";

// Load .env for local dev. No-op when the file is absent (e.g. Cloud Run, where
// config comes from Secret Manager env vars instead) — anything but ENOENT still throws.
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const PORT = Number(process.env.PORT ?? 8890);
// No fallback: a missed secret on a real deploy must fail loudly, not quietly become
// a publicly-known credential.
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;
if (!MCP_SERVER_TOKEN) {
  throw new Error(
    "MCP_SERVER_TOKEN is not set. Copy mcp-server/.env.example to mcp-server/.env and set a real random value — there is no default.",
  );
}
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_TEAM_KEY = process.env.LINEAR_TEAM_KEY ?? "OPS";

// ---------------------------------------------------------------------------
// Direct, narrow Postgres access to the customers table — see
// docs/ARCHITECTURE.md gotcha #7: Supabase's own remote MCP server is a
// project-management API (create/pause projects, run migrations, deploy edge
// functions), not a data-query tool. Its only tool that can read row data,
// execute_sql, is correctly annotated destructive/non-read-only, so
// enable_tools: ["@read-only"] on that catalog connector leaves the agent with
// no way to actually read a customer row. This connects with the
// recoup_agent_readonly Postgres role (SELECT on customers only, verified in
// Phase 3) instead — undefined when unset, so this tool degrades to an error
// rather than crashing the whole server, since it's optional at start time.
const CUSTOMERS_DB_URL = process.env.CUSTOMERS_DB_URL;
const customersDb = CUSTOMERS_DB_URL ? new Pool({ connectionString: CUSTOMERS_DB_URL, max: 3 }) : undefined;

// ---------------------------------------------------------------------------
// A second, separate Postgres connection using the recoup_actions_service role
// (SELECT on dunning_policy, SELECT+INSERT on recovery_ledger — never the same
// role as customersDb above, which represents what the *agent* can read via
// get_customer_ltv). This is the server's own audit trail, not something the
// agent has any access to.
// ---------------------------------------------------------------------------
const RECOVERY_LEDGER_DB_URL = process.env.RECOVERY_LEDGER_DB_URL;
const ledgerDb = RECOVERY_LEDGER_DB_URL ? new Pool({ connectionString: RECOVERY_LEDGER_DB_URL, max: 3 }) : undefined;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${String(ms)}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

type LedgerEntry = {
  companyId: string;
  actionType: "retry_eligible_charges" | "open_recovery_ticket";
  reason: string;
  chargeIds?: string[];
  linearIssueId?: string;
  amountUsd: number;
  outcome: unknown;
};

function insertLedgerRow(entry: LedgerEntry) {
  // 'allow' is the only decision this server ever observes — TrueForge simply
  // never calls the tool on Deny, so there is no path to record a denial here.
  return ledgerDb!.query(
    `insert into public.recovery_ledger
       (action_type, reason, human_decision, charge_ids, linear_issue_id, amount_usd, outcome, company_id)
     values ($1, $2, 'allow', $3, $4, $5, $6, $7)`,
    [entry.actionType, entry.reason, entry.chargeIds ?? null, entry.linearIssueId ?? null, entry.amountUsd, JSON.stringify(entry.outcome), entry.companyId],
  );
}

// In-process durable-enough queue: an entry that fails its immediate write is
// retried here indefinitely (not just once) until it succeeds, so a ledger
// outage longer than the immediate bounded attempt still doesn't *permanently*
// lose the audit row for an action that already succeeded for real — only
// losable if this process itself dies with entries still queued, which a
// full external outbox (Cloud Tasks, a queue table) would close but is more
// infra than this project's audit trail warrants.
const pendingLedgerEntries: LedgerEntry[] = [];
let ledgerFlushTimer: NodeJS.Timeout | undefined;

function scheduleLedgerFlush(): void {
  if (ledgerFlushTimer) return;
  ledgerFlushTimer = setInterval(() => {
    void flushPendingLedgerEntries();
  }, 10_000);
}

async function flushPendingLedgerEntries(): Promise<void> {
  if (pendingLedgerEntries.length === 0) {
    clearInterval(ledgerFlushTimer);
    ledgerFlushTimer = undefined;
    return;
  }
  const batch = pendingLedgerEntries.splice(0, pendingLedgerEntries.length);
  for (const entry of batch) {
    try {
      await withTimeout(insertLedgerRow(entry), 1500);
    } catch (err) {
      console.error("[recovery_ledger] background retry still failing, re-queued:", err instanceof Error ? err.message : err);
      pendingLedgerEntries.push(entry);
    }
  }
}

// The immediate attempt is bounded (1.5s) so a slow ledger DB can't stall an
// already-succeeded Stripe/Linear action's response — anything that doesn't
// land immediately falls back to the background queue above instead of being
// discarded, since the real action already happened and losing the audit row
// is a worse outcome than a delayed one.
async function recordLedgerEntry(entry: LedgerEntry): Promise<void> {
  if (!ledgerDb) return;
  try {
    await withTimeout(insertLedgerRow(entry), 1500);
  } catch (err) {
    console.error("[recovery_ledger] immediate write failed, queued for background retry:", err instanceof Error ? err.message : err);
    pendingLedgerEntries.push(entry);
    scheduleLedgerFlush();
  }
}

// Guards Finding #9 (double-counting): a charge already credited as recovered
// in a prior *live* run must not be counted again if the same batch is
// resubmitted — Stripe itself is safe to re-confirm, but our own sum isn't.
// Scoped to the tenant and overlap-filtered in SQL rather than loading the
// whole ledger's arrays into memory on every call.
async function getAlreadyRecoveredChargeIds(companyId: string, chargeIds: string[]): Promise<Set<string>> {
  if (!ledgerDb || chargeIds.length === 0) return new Set();
  try {
    const result = await withTimeout(
      ledgerDb.query<{ charge_ids: string[] | null }>(
        `select charge_ids from public.recovery_ledger
         where action_type = 'retry_eligible_charges' and outcome ->> 'dry_run' = 'false'
           and company_id = $1 and charge_ids && $2::text[]`,
        [companyId, chargeIds],
      ),
      1500,
    );
    return new Set(result.rows.flatMap((row) => row.charge_ids ?? []));
  } catch (err) {
    // Fail open on the read: worst case a genuine re-recovery is undercounted
    // once, which is far better than blocking every retry on a ledger outage.
    console.error("[recovery_ledger] dedup lookup failed (proceeding without it):", err instanceof Error ? err.message : err);
    return new Set();
  }
}

// Enforces dunning_policy.max_auto_retry_attempts from the ledger's own
// history — the agent never gets to decide a charge has budget left. Counts
// within the same mode as the current call (a dry-run rehearsal shouldn't
// exhaust a charge's live budget, and vice versa). Fails CLOSED: if the
// history can't be read, no charge gets another attempt on a guess.
async function getRetryAttemptCounts(companyId: string, chargeIds: string[], dryRun: boolean): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!ledgerDb || chargeIds.length === 0) return counts;
  const result = await withTimeout(
    ledgerDb.query<{ charge_id: string; attempts: string }>(
      `select unnest(charge_ids) as charge_id, count(*) as attempts
       from public.recovery_ledger
       where action_type = 'retry_eligible_charges' and outcome ->> 'dry_run' = $3
         and company_id = $1 and charge_ids && $2::text[]
       group by 1`,
      [companyId, chargeIds, dryRun ? "true" : "false"],
    ),
    1500,
  );
  for (const row of result.rows) counts.set(row.charge_id, Number(row.attempts));
  return counts;
}

// The real decline code and customer for a charge, from Stripe itself — the
// point is that eligibility is checked against what Stripe says happened, not
// against what the caller claims happened.
type VerifiedCharge = { declineCode: string | undefined; customerId: string | undefined };

async function verifyChargeWithStripe(stripe: import("stripe").default, chargeId: string): Promise<VerifiedCharge> {
  if (chargeId.startsWith("in_")) {
    const invoice = await stripe.invoices.retrieve(chargeId, { expand: ["payment_intent"] });
    const pi = typeof invoice.payment_intent === "object" ? invoice.payment_intent : undefined;
    return {
      declineCode: pi?.last_payment_error?.decline_code ?? pi?.last_payment_error?.code ?? undefined,
      customerId: typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? undefined),
    };
  }
  const pi = await stripe.paymentIntents.retrieve(chargeId);
  return {
    declineCode: pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? undefined,
    customerId: typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? undefined),
  };
}

// Which of these customers sit in an ltv_tier the tenant's policy marks
// escalate_to_human_always — those belong on the open_recovery_ticket path
// (a human owns that relationship), never in an auto-retry batch, even one a
// human just approved: the approval was for a batch that policy says should
// not have contained them. Read via customersDb (the same data the agent
// reads) because the actions-service role deliberately has no customers grant.
async function getEscalateAlwaysCustomerIds(companyId: string, customerIds: string[], policy: DunningPolicy): Promise<Set<string>> {
  const escalateTiers = Object.entries(policy.ltv_tiers)
    .filter(([, tier]) => tier.escalate_to_human_always)
    .map(([name]) => name);
  if (!customersDb || escalateTiers.length === 0 || customerIds.length === 0) return new Set();
  const result = await withTimeout(
    customersDb.query<{ id: string }>(
      "select id from public.customers where company_id = $1 and id = any($2::text[]) and ltv_tier = any($3::text[])",
      [companyId, customerIds, escalateTiers],
    ),
    1500,
  );
  return new Set(result.rows.map((r) => r.id));
}

// Logs who get_account_usage actually looked at, so the eval scorer can score against a reviewed set instead of the whole real population.
async function recordAccountHealthReviews(companyId: string, customerIds: string[]): Promise<void> {
  if (!ledgerDb || customerIds.length === 0) return;
  try {
    const values = customerIds.map((_, i) => `($${String(i * 2 + 1)}, $${String(i * 2 + 2)})`).join(",");
    const params = customerIds.flatMap((id) => [id, companyId]);
    await withTimeout(
      ledgerDb.query(
        `insert into public.account_health_reviews (customer_id, company_id)
         values ${values}
         on conflict (customer_id) do update
           set last_reviewed_at = now(), review_count = account_health_reviews.review_count + 1`,
        params,
      ),
      1500,
    );
  } catch (err) {
    console.error("[account_health_reviews] best-effort log failed (not retried):", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Per-tenant dunning policy — Recoup runs recovery for multiple companies
// (see public.companies), and each tenant's real revenue distribution needs
// its own thresholds: comp_arcline_software's $500 "always escalate" cutoff
// makes sense for a SaaS business billing up to $3,100/mo, but comp_meridian_
// telecom's real subscriber base tops out at $118.75/mo (verified against the
// actual dataset), so the SAME cutoff would silently never fire for its
// highest-value accounts. Read from public.dunning_policy (keyed by
// company_id), not a hardcoded constant — this used to be inlined here "so
// the starter kit has zero required external state to run," but every other
// tool already hard-requires customersDb/ledgerDb, so that tradeoff no
// longer buys anything.
// ---------------------------------------------------------------------------
type DunningPolicy = {
  max_auto_retry_attempts: number;
  never_retry_decline_codes: string[];
  safe_to_retry_decline_codes: string[];
  retry_backoff_hours: number[];
  ltv_tiers: Record<string, { min_mrr_usd: number; escalate_to_human_always?: boolean }>;
  updated_at: string;
};

async function getDunningPolicy(pool: Pool, companyId: string): Promise<DunningPolicy | undefined> {
  const result = await pool.query<DunningPolicy>(
    `select max_auto_retry_attempts, never_retry_decline_codes, safe_to_retry_decline_codes,
            retry_backoff_hours, ltv_tiers, updated_at::text
     from public.dunning_policy where company_id = $1`,
    [companyId],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Linear's IssueCreateInput.teamId requires a resolved team UUID — team_key /
// LINEAR_TEAM_KEY are human-readable keys (e.g. "OPS"), not UUIDs, so resolve first.
// ---------------------------------------------------------------------------
async function resolveLinearTeamId(apiKey: string, teamKey: string): Promise<string> {
  const query = `query TeamByKey($key: String!) {
    teams(filter: { key: { eq: $key } }) { nodes { id key } }
  }`;
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables: { key: teamKey } }),
  });
  const json = await response.json();
  const teamId = json?.data?.teams?.nodes?.[0]?.id as string | undefined;
  if (!teamId) {
    throw new Error(`No Linear team found for key "${teamKey}" — check LINEAR_TEAM_KEY / team_key.`);
  }
  return teamId;
}

// ---------------------------------------------------------------------------
// MCP server + tool registrations
// ---------------------------------------------------------------------------
function buildServer(): McpServer {
  const server = new McpServer({ name: "recoup-actions-mcp", version: "0.1.0" });

  // --- Read-only tool: never gated, safe to call freely -------------------
  server.registerTool(
    "get_dunning_thresholds",
    {
      title: "Get dunning thresholds",
      description:
        "Return one company's dunning/retry policy: which decline codes are safe to retry, which must " +
        "never be retried, max retry attempts, backoff schedule, and LTV tiers used to decide when a " +
        "human must be looped in regardless of $ amount. Thresholds are tenant-specific — always pass " +
        "the company_id you are currently investigating, never assume another tenant's numbers apply.",
      inputSchema: {
        company_id: z.string().describe("The tenant company to fetch policy for, e.g. comp_arcline_software."),
      },
      annotations: {
        title: "Get dunning thresholds",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ company_id }) => {
      if (!customersDb) {
        return { isError: true, content: [{ type: "text", text: "CUSTOMERS_DB_URL is not configured — cannot query policy data." }] };
      }
      const policy = await getDunningPolicy(customersDb, company_id);
      if (!policy) {
        return { isError: true, content: [{ type: "text", text: `No dunning_policy row for company_id "${company_id}".` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(policy, null, 2) }] };
    },
  );

  // --- Read-only tool: the actual customer-data read path -------------------
  server.registerTool(
    "get_customer_ltv",
    {
      title: "Get customer LTV data",
      description:
        "Look up plan, MRR, and LTV tier for a batch of customer IDs within ONE tenant company, joined " +
        "from the business-data table. Use this instead of the Supabase connector's execute_sql tool — " +
        "that tool is annotated destructive (it can run arbitrary SQL) and is excluded by this agent's " +
        "@read-only restriction, so it cannot return row data even for a plain SELECT. Capped at 50 IDs " +
        "per call by design — this data lands in your own context, so request a specific working set " +
        "(the batch you're actually about to classify or retry), not an entire tenant's population.",
      inputSchema: {
        company_id: z.string().describe("The tenant company these customer IDs belong to."),
        customer_ids: z.array(z.string()).min(1).max(50).describe("Customer IDs to look up (max 50 per call)."),
      },
      annotations: {
        title: "Get customer LTV data",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ company_id, customer_ids }) => {
      if (!customersDb) {
        return {
          isError: true,
          content: [{ type: "text", text: "CUSTOMERS_DB_URL is not configured — cannot query customer data." }],
        };
      }
      const result = await customersDb.query(
        "select id, name, plan, mrr_usd, ltv_tier from public.customers where company_id = $1 and id = any($2::text[])",
        [company_id, customer_ids],
      );
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    },
  );

  // --- Read-only tool: discover which customer IDs to investigate ---------
  server.registerTool(
    "list_customers",
    {
      title: "List customers for a tenant",
      description:
        "Discover a bounded, filtered shortlist of customer IDs for ONE tenant company — the starting " +
        "point when you don't already have specific IDs in hand (e.g. from a Stripe failed-charge or " +
        "refund list). Not every tenant's customers exist in Stripe: comp_meridian_telecom's real " +
        "subscriber population is DB-only, so this is the ONLY way to find its customer IDs — Stripe's " +
        "own tools will not surface them. Always filtered and capped (max 50, default 20) — never returns " +
        "a whole tenant's population; narrow with ltv_tier / contract_type or raise the limit deliberately, " +
        "never loop calling this to enumerate everyone.",
      inputSchema: {
        company_id: z.string().describe("The tenant company to list customers for."),
        ltv_tier: z.enum(["high", "medium", "low"]).optional().describe("Filter to one LTV tier."),
        contract_type: z
          .string()
          .optional()
          .describe("Filter to an exact contract_type value — only populated for some tenants (e.g. comp_meridian_telecom's 'Month-to-month', 'One year', 'Two year')."),
        limit: z.number().int().min(1).max(50).default(20).describe("Max rows to return (default 20, max 50)."),
      },
      annotations: {
        title: "List customers for a tenant",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    // Bounded, filtered discovery — the agent's only way to find customer_ids for a Stripe-absent tenant like comp_meridian_telecom.
    async ({ company_id, ltv_tier, contract_type, limit }) => {
      if (!customersDb) {
        return { isError: true, content: [{ type: "text", text: "CUSTOMERS_DB_URL is not configured — cannot query customer data." }] };
      }
      const conditions = ["company_id = $1"];
      const params: unknown[] = [company_id];
      if (ltv_tier) {
        params.push(ltv_tier);
        conditions.push(`ltv_tier = $${String(params.length)}`);
      }
      if (contract_type) {
        params.push(contract_type);
        conditions.push(`contract_type = $${String(params.length)}`);
      }
      params.push(limit);
      const result = await customersDb.query(
        `select id, name, plan, mrr_usd, ltv_tier from public.customers
         where ${conditions.join(" and ")}
         order by mrr_usd desc
         limit $${String(params.length)}`,
        params,
      );
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    },
  );

  // --- Read-only tool: account-health signals (usage OR real subscriber attributes) ---
  server.registerTool(
    "get_account_usage",
    {
      title: "Get account usage / health signals",
      description:
        "Look up the observable health signals for a batch of customer IDs within ONE tenant company — " +
        "used to judge renewal/expansion risk, NOT to look up a known outcome. Different tenants expose " +
        "different signals depending on their business: SaaS tenants (e.g. comp_arcline_software) return " +
        "seat/API usage from product telemetry; comp_meridian_telecom returns real subscriber attributes " +
        "(tenure, contract type, payment method, total lifetime charges) instead — it has no seats or API " +
        "quota. Fields that don't apply to a given tenant come back null; do not treat a null as zero. " +
        "Capped at 50 IDs per call — pull a specific shortlist to reason about, not a whole tenant.",
      inputSchema: {
        company_id: z.string().describe("The tenant company these customer IDs belong to."),
        customer_ids: z.array(z.string()).min(1).max(50).describe("Customer IDs to look up (max 50 per call)."),
      },
      annotations: {
        title: "Get account usage / health signals",
        // Not pure read-only: every call best-effort logs itself into
        // account_health_reviews (see recordAccountHealthReviews) so the
        // eval scorer knows what was actually reviewed. That's an audit
        // side effect, not a consequential action — same category as
        // recovery_ledger writes happening unconditionally regardless of
        // DRY_RUN — so it stays out of require_approval_for_tools, but the
        // annotation says so honestly rather than claiming a pure read.
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ company_id, customer_ids }) => {
      if (!customersDb) {
        return { isError: true, content: [{ type: "text", text: "CUSTOMERS_DB_URL is not configured — cannot query usage data." }] };
      }
      const result = await customersDb.query(
        `select
           c.id, c.name, c.ltv_tier, c.mrr_usd,
           c.tenure_months, c.contract_type, c.payment_method, c.total_charges_usd,
           u.seats_included, u.seats_used, u.api_quota_30d, u.api_calls_30d, u.last_active_date
         from public.customers c
         left join public.product_usage u on u.customer_id = c.id
         where c.company_id = $1 and c.id = any($2::text[])`,
        [company_id, customer_ids],
      );
      await recordAccountHealthReviews(
        company_id,
        result.rows.map((r) => r.id as string),
      );
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    },
  );

  // --- Gated write tool: retries a batch of eligible charges ---------------
  server.registerTool(
    "retry_eligible_charges",
    {
      title: "Retry eligible charges",
      description:
        "Retry a batch of failed Stripe charges/invoices that were classified as safe-to-retry " +
        "(e.g. insufficient_funds, do_not_honor). This server does NOT trust the caller's " +
        "classification: when a Stripe key is configured it fetches each charge's REAL decline code " +
        "and customer from Stripe, blocks real never-retry codes, blocks claimed-vs-real mismatches, " +
        "blocks customers in escalate_to_human_always LTV tiers, and always enforces " +
        "max_auto_retry_attempts from its own ledger history. Expect per-charge blocked_* statuses " +
        "in the result when any of these fire. Moves real money when DRY_RUN is off — this call is " +
        "annotated destructive and MUST be gated behind human approval in the agent spec " +
        "(require_approval_for_tools).",
      inputSchema: {
        company_id: z.string().describe("The tenant company these charges belong to — its dunning_policy governs the never-retry check below."),
        charges: z
          .array(
            z.object({
              charge_id: z.string().describe("Stripe PaymentIntent (pi_...) or Invoice (in_...) ID to retry."),
              decline_code: z.string().describe("The decline code this charge failed with, e.g. insufficient_funds."),
              amount_usd: z
                .number()
                .nonnegative()
                .describe("The charge amount in USD — from the same sandbox computation that sized this batch. Recorded for the recovery ledger, not used for eligibility."),
            }),
          )
          .min(1)
          .max(50)
          .describe("Batch of charges to retry, each with the decline code it failed with (max 50 per call — one approval per batch, not one per charge)."),
        reason: z.string().describe("One-sentence justification the agent generated for this batch."),
      },
      annotations: {
        title: "Retry eligible charges",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ company_id, charges, reason }) => {
      if (!ledgerDb) {
        return { isError: true, content: [{ type: "text", text: "RECOVERY_LEDGER_DB_URL is not configured — cannot verify dunning policy independently." }] };
      }
      // Server-side policy check, deliberately using the actions-service pool
      // (not customersDb). The point of everything below: eligibility is
      // decided from what Stripe and this server's own ledger say, never from
      // what the caller claims — an agent that mislabels a stolen_card charge
      // as insufficient_funds must not sail through on its own homework.
      const policy = await getDunningPolicy(ledgerDb, company_id);
      if (!policy) {
        return { isError: true, content: [{ type: "text", text: `No dunning_policy row for company_id "${company_id}" — refusing to guess at never-retry codes.` }] };
      }
      // Any Stripe call — including verification reads — only ever with a
      // test-mode key. Checked before the first call, not just the live path.
      if (STRIPE_SECRET_KEY && !STRIPE_SECRET_KEY.startsWith("sk_test_")) {
        return {
          isError: true,
          content: [{ type: "text", text: "STRIPE_SECRET_KEY is not a test-mode key (must start with sk_test_) — refusing to make any Stripe call." }],
        };
      }

      const neverRetry = new Set<string>(policy.never_retry_decline_codes);
      const blockedResults: { id: string; status: string; decline_code?: string; detail?: string }[] = [];
      // First screen: the claimed code. Cheap, but never sufficient on its own.
      let eligible = charges.filter((c) => {
        if (!neverRetry.has(c.decline_code)) return true;
        blockedResults.push({ id: c.charge_id, status: "blocked_never_retry", decline_code: c.decline_code });
        return false;
      });

      // Second screen: max_auto_retry_attempts, from this server's own ledger
      // history. Fails CLOSED — no history read, no retry budget granted.
      let attemptCounts: Map<string, number>;
      try {
        attemptCounts = await getRetryAttemptCounts(company_id, eligible.map((c) => c.charge_id), DRY_RUN);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Cannot read retry-attempt history from the ledger — refusing to retry without knowing each charge's remaining budget. (${err instanceof Error ? err.message : String(err)})` }],
        };
      }
      eligible = eligible.filter((c) => {
        const attempts = attemptCounts.get(c.charge_id) ?? 0;
        if (attempts < policy.max_auto_retry_attempts) return true;
        blockedResults.push({
          id: c.charge_id,
          status: "blocked_max_attempts",
          detail: `already retried ${String(attempts)}x, policy allows ${String(policy.max_auto_retry_attempts)}`,
        });
        return false;
      });

      // Third screen, when a Stripe key is available (works in DRY_RUN too):
      // fetch each charge's REAL decline code and customer from Stripe, block
      // real never-retry codes, block claimed-vs-real mismatches outright
      // (a wrong classification means the batch composition can't be trusted),
      // and block customers whose ltv_tier is escalate_to_human_always —
      // policy says those belong on the ticket path, not in a retry batch.
      // Individual verification failures fail closed per charge.
      let verification: "stripe_verified" | "caller_claimed_only" = "caller_claimed_only";
      if (STRIPE_SECRET_KEY) {
        verification = "stripe_verified";
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(STRIPE_SECRET_KEY);
        const verified = new Map<string, VerifiedCharge>();
        for (const c of eligible) {
          try {
            verified.set(c.charge_id, await verifyChargeWithStripe(stripe, c.charge_id));
          } catch (err) {
            verified.set(c.charge_id, { declineCode: undefined, customerId: undefined });
            blockedResults.push({
              id: c.charge_id,
              status: "blocked_unverified",
              detail: `could not fetch this charge from Stripe to verify it: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
        eligible = eligible.filter((c) => {
          if (blockedResults.some((b) => b.id === c.charge_id)) return false;
          const real = verified.get(c.charge_id);
          if (real?.declineCode && neverRetry.has(real.declineCode)) {
            blockedResults.push({ id: c.charge_id, status: "blocked_never_retry", decline_code: real.declineCode, detail: "Stripe's real decline code, not the claimed one" });
            return false;
          }
          if (real?.declineCode && real.declineCode !== c.decline_code) {
            blockedResults.push({
              id: c.charge_id,
              status: "blocked_decline_code_mismatch",
              detail: `caller claimed ${c.decline_code}, Stripe says ${real.declineCode} — re-propose with the real code`,
            });
            return false;
          }
          return true;
        });
        const customerIdsByCharge = new Map(eligible.map((c) => [c.charge_id, verified.get(c.charge_id)?.customerId]));
        const customerIds = [...new Set([...customerIdsByCharge.values()].filter((id): id is string => Boolean(id)))];
        try {
          const escalateAlways = await getEscalateAlwaysCustomerIds(company_id, customerIds, policy);
          eligible = eligible.filter((c) => {
            const customerId = customerIdsByCharge.get(c.charge_id);
            if (!customerId || !escalateAlways.has(customerId)) return true;
            blockedResults.push({
              id: c.charge_id,
              status: "blocked_escalate_tier",
              detail: `customer ${customerId} is in an escalate_to_human_always LTV tier — open_recovery_ticket is the policy path for this account`,
            });
            return false;
          });
        } catch (err) {
          console.error("[retry_eligible_charges] LTV-tier escalation check unavailable (proceeding without it):", err instanceof Error ? err.message : err);
        }
      }

      if (DRY_RUN || !STRIPE_SECRET_KEY) {
        const results = eligible.map((c) => ({ id: c.charge_id, status: "simulated_retry_success" as const }));
        const amountUsd = eligible.reduce((sum, c) => sum + c.amount_usd, 0);
        await recordLedgerEntry({
          companyId: company_id,
          actionType: "retry_eligible_charges",
          reason,
          chargeIds: eligible.map((c) => c.charge_id),
          amountUsd,
          outcome: { dry_run: true, verification, results: [...blockedResults, ...results] },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dry_run: true,
                  verification,
                  note:
                    "DRY_RUN is on — no charge was actually retried." +
                    (verification === "caller_claimed_only"
                      ? " No STRIPE_SECRET_KEY is set, so decline codes could not be independently verified against Stripe this run."
                      : " Decline codes and LTV tiers WERE independently verified against Stripe before simulating."),
                  reason,
                  results: [...blockedResults, ...results],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Live path. PaymentIntents and Invoices need different Stripe calls — distinguish
      // by ID prefix (pi_ vs in_) rather than assuming every ID is a PaymentIntent.
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(STRIPE_SECRET_KEY);
      type LiveResult = { id: string; status: string | null; claimed_amount_usd: number; stripe_amount_usd: number; error?: string };
      const liveResults: LiveResult[] = [];
      // Chunked, not one unbounded Promise.all of 50 concurrent Stripe writes.
      const CONCURRENCY = 10;
      for (let i = 0; i < eligible.length; i += CONCURRENCY) {
        const chunk = eligible.slice(i, i + CONCURRENCY);
        const chunkResults = await Promise.all(
          chunk.map(async ({ charge_id, amount_usd }): Promise<LiveResult> => {
            try {
              if (charge_id.startsWith("in_")) {
                const invoice = await stripe.invoices.pay(charge_id);
                return { id: charge_id, status: invoice.status, claimed_amount_usd: amount_usd, stripe_amount_usd: (invoice.amount_paid ?? 0) / 100 };
              }
              const pi = await stripe.paymentIntents.confirm(charge_id);
              return { id: charge_id, status: pi.status, claimed_amount_usd: amount_usd, stripe_amount_usd: (pi.amount_received ?? 0) / 100 };
            } catch (err) {
              return { id: charge_id, status: "error", claimed_amount_usd: amount_usd, stripe_amount_usd: 0, error: err instanceof Error ? err.message : String(err) };
            }
          }),
        );
        liveResults.push(...chunkResults);
      }
      // Only a genuinely-paid result counts as "recovered" — confirm() can
      // return requires_action/requires_payment_method/canceled without
      // throwing, and only "paid" means an invoice actually collected. The
      // recovered sum uses STRIPE's amount_received/amount_paid, never the
      // agent's claimed figure — the claimed figure is recorded alongside it
      // so the ledger shows claimed-vs-actual for every batch.
      const isRecovered = (r: { id: string; status: string | null }) =>
        r.id.startsWith("in_") ? r.status === "paid" : r.status === "succeeded";
      // A charge already credited in a prior live run must not be counted
      // again if this exact batch gets resubmitted (Finding #9).
      const alreadyRecovered = await getAlreadyRecoveredChargeIds(company_id, eligible.map((c) => c.charge_id));
      const recoveredUsd = liveResults
        .filter((r) => isRecovered(r) && !alreadyRecovered.has(r.id))
        .reduce((sum, r) => sum + r.stripe_amount_usd, 0);
      const claimedUsd = eligible.reduce((sum, c) => sum + c.amount_usd, 0);
      await recordLedgerEntry({
        companyId: company_id,
        actionType: "retry_eligible_charges",
        reason,
        chargeIds: eligible.map((c) => c.charge_id),
        amountUsd: recoveredUsd,
        outcome: { dry_run: false, verification, claimed_amount_usd: claimedUsd, recovered_amount_usd: recoveredUsd, results: [...blockedResults, ...liveResults] },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ dry_run: false, verification, reason, recovered_amount_usd: recoveredUsd, results: [...blockedResults, ...liveResults] }, null, 2),
          },
        ],
      };
    },
  );

  // --- Gated write tool: opens an eng ticket for the non-retryable slice ---
  server.registerTool(
    "open_recovery_ticket",
    {
      title: "Open recovery ticket",
      description:
        "File a Linear issue for a payment-failure root cause that looks like an internal bug " +
        "(webhook/integration error, not a customer's card) rather than something the agent should retry.",
      inputSchema: {
        company_id: z.string().describe("The tenant company this ticket is about."),
        title: z.string(),
        description: z.string().describe("Root-cause summary with evidence: linked Sentry issue, affected charge IDs, $ at risk."),
        priority: z.enum(["urgent", "high", "medium", "low"]).default("high"),
        team_key: z.string().optional(),
        amount_at_risk_usd: z
          .number()
          .nonnegative()
          .describe("The $ at risk for this segment, from the same sandbox computation that sized it. Recorded for the recovery ledger."),
        customer_ids: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            "Optional: the specific customer IDs this ticket flags (e.g. accounts an account-health review classified as at-risk). " +
              "Not needed for a pure engineering bug ticket. Recorded on the ledger so a classification can later be scored against " +
              "a real recorded outcome, not eyeballed.",
          ),
      },
      annotations: {
        title: "Open recovery ticket",
        readOnlyHint: false,
        destructiveHint: false, // a write, but not destructive — falls under @write, not @destructive
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ company_id, title, description, priority, team_key, amount_at_risk_usd, customer_ids }) => {
      if (!ledgerDb) {
        return { isError: true, content: [{ type: "text", text: "RECOVERY_LEDGER_DB_URL is not configured — cannot validate the tenant." }] };
      }
      // Validate BEFORE creating anything — a bad company_id must never reach
      // Linear (or even the simulated dry-run path) and then only surface as
      // a foreign-key error on the async ledger write, which would leave a
      // real ticket permanently unaudited (the ledger insert can't succeed
      // against a company_id that doesn't exist, no matter how many times
      // the background retry queue tries).
      const companyExists = await ledgerDb.query("select 1 from public.companies where id = $1", [company_id]);
      if (companyExists.rowCount === 0) {
        return { isError: true, content: [{ type: "text", text: `No company "${company_id}" — refusing to file a ticket for an unknown tenant.` }] };
      }
      if (DRY_RUN || !LINEAR_API_KEY) {
        const simulatedIssue = { id: `SIM-${randomUUID().slice(0, 8)}`, title, priority, team_key: team_key ?? LINEAR_TEAM_KEY };
        await recordLedgerEntry({
          companyId: company_id,
          actionType: "open_recovery_ticket",
          reason: description,
          linearIssueId: simulatedIssue.id,
          amountUsd: amount_at_risk_usd,
          outcome: { dry_run: true, simulated_issue: simulatedIssue, customer_ids: customer_ids ?? null },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dry_run: true,
                  note: "DRY_RUN is on (or LINEAR_API_KEY is unset) — no real Linear ticket was created.",
                  simulated_issue: simulatedIssue,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      try {
        const teamId = await resolveLinearTeamId(LINEAR_API_KEY, team_key ?? LINEAR_TEAM_KEY);
        const priorityMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
        const query = `mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }`;
        const response = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: LINEAR_API_KEY },
          body: JSON.stringify({
            query,
            variables: { input: { title, description, priority: priorityMap[priority], teamId } },
          }),
        });
        const json = await response.json();
        const issueCreate = json?.data?.issueCreate;
        if (!response.ok || json.errors || !issueCreate?.success) {
          // Never report a filed ticket unless Linear actually confirmed one — the
          // approving human trusts this response as ground truth.
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { dry_run: false, error: "Linear did not confirm issue creation", linear_response: json },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        await recordLedgerEntry({
          companyId: company_id,
          actionType: "open_recovery_ticket",
          reason: description,
          linearIssueId: issueCreate.issue?.identifier ?? issueCreate.issue?.id,
          amountUsd: amount_at_risk_usd,
          outcome: { dry_run: false, issue: issueCreate.issue, customer_ids: customer_ids ?? null },
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ dry_run: false, issue: issueCreate.issue }, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// HTTP wiring — stateless Streamable HTTP, one POST /mcp endpoint.
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (token !== MCP_SERVER_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// Both paths on purpose: Google's frontend reserves the literal /healthz on
// *.run.app and serves its own 404 before the request reaches this container
// (verified live — /healthz gets GFE's 404 page, every other path reaches
// Express). /health is the one that works on Cloud Run; /healthz kept for
// local/other hosts.
app.get(["/health", "/healthz"], (_req, res) => {
  res.json({ ok: true, dry_run: DRY_RUN });
});

// Public and aggregate-only so the cockpit's browser can call it directly — never row-level detail, never the MCP bearer token.
// Optional ?company_id= scopes to one tenant; omitted, it aggregates across all of them.
// 30s in-memory cache per scope: this endpoint is unauthenticated, so without
// it every anonymous request is a free Postgres query against the demo DB.
const statsCache = new Map<string, { at: number; body: unknown }>();
app.get("/stats", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (!ledgerDb) {
    res.json({ total_recovered_usd: 0, tickets_opened: 0, actions_count: 0 });
    return;
  }
  const companyId = typeof req.query.company_id === "string" ? req.query.company_id : undefined;
  const cached = statsCache.get(companyId ?? "*");
  if (cached && Date.now() - cached.at < 30_000) {
    res.json(cached.body);
    return;
  }
  try {
    // DRY_RUN is the project-wide default — rehearsal runs still
    // write to the ledger for their own audit trail, but must never inflate
    // the number a judge or stakeholder reads as real recovered revenue.
    const result = await ledgerDb.query<{ total_recovered_usd: string | null; tickets_opened: string; actions_count: string }>(
      `select
         coalesce(sum(amount_usd) filter (where action_type = 'retry_eligible_charges' and outcome ->> 'dry_run' = 'false'), 0) as total_recovered_usd,
         count(*) filter (where action_type = 'open_recovery_ticket' and outcome ->> 'dry_run' = 'false') as tickets_opened,
         count(*) filter (where outcome ->> 'dry_run' = 'false') as actions_count
       from public.recovery_ledger
       where $1::text is null or company_id = $1`,
      [companyId ?? null],
    );
    const row = result.rows[0];
    const body = {
      total_recovered_usd: Number(row?.total_recovered_usd ?? 0),
      tickets_opened: Number(row?.tickets_opened ?? 0),
      actions_count: Number(row?.actions_count ?? 0),
    };
    statsCache.set(companyId ?? "*", { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    console.error("[/stats] query failed:", err instanceof Error ? err.message : err);
    res.status(503).json({ error: "stats temporarily unavailable" });
  }
});

app.post("/mcp", requireBearerToken, async (req, res) => {
  // Stateless mode: a fresh server + transport per request, closed when the
  // response ends. Simplest correct option for six low-traffic tools.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const httpServer = app.listen(PORT, () => {
  console.log(`recoup-actions-mcp listening on :${PORT} (DRY_RUN=${DRY_RUN})`);
  console.log(`Register in TrueForge as a remote MCP server at http(s)://<public-url>/mcp`);
  console.log("Header auth configured — send Authorization: Bearer <your MCP_SERVER_TOKEN> (never logged)");
});

// Cloud Run's scale-to-zero sends SIGTERM as the NORMAL lifecycle, not an edge
// case — without this, any queued ledger rows for already-succeeded actions
// die with the process, which defeats the retry queue's whole purpose. Flush
// once, best-effort, inside Cloud Run's 10s grace window, then exit.
process.on("SIGTERM", () => {
  console.log(`[shutdown] SIGTERM: flushing ${String(pendingLedgerEntries.length)} queued ledger entr(ies) before exit`);
  httpServer.close();
  void (async () => {
    try {
      await flushPendingLedgerEntries();
    } finally {
      await Promise.allSettled([customersDb?.end(), ledgerDb?.end()]);
      process.exit(pendingLedgerEntries.length === 0 ? 0 : 1);
    }
  })();
});
