/**
 * recoup-actions-mcp
 * ------------------
 * A minimal, stateless, remote MCP server (Streamable HTTP transport) that TrueForge
 * connects to like any catalog server — via Settings → Connectors → "Add MCP Server".
 *
 * Why this exists: the shipped Stripe / Linear MCP servers expose Stripe's and Linear's
 * full, generic APIs. For the Recoup agent we want exactly TWO high-level, batch-shaped
 * write actions the harness can gate behind a single human approval, plus one safe
 * read-only tool. Building this ourselves (rather than composing raw Stripe/Linear calls
 * in a loop) means:
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
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${String(ms)}ms`)), ms)),
  ]);
}

// A slow or unreachable ledger DB must never turn an already-succeeded Stripe/
// Linear action into a stalled response — bounded retry (short timeout, one
// retry) instead of an unbounded await, and never throw: the real action
// already happened, so a lost audit row is a worse outcome than a lost retry.
async function recordLedgerEntry(entry: {
  actionType: "retry_eligible_charges" | "open_recovery_ticket";
  reason: string;
  chargeIds?: string[];
  linearIssueId?: string;
  amountUsd: number;
  outcome: unknown;
}): Promise<void> {
  if (!ledgerDb) return;
  const attempt = () =>
    ledgerDb.query(
      `insert into public.recovery_ledger
         (action_type, reason, human_decision, charge_ids, linear_issue_id, amount_usd, outcome)
       values ($1, $2, 'allow', $3, $4, $5, $6)`,
      [
        entry.actionType,
        entry.reason,
        entry.chargeIds ?? null,
        entry.linearIssueId ?? null,
        entry.amountUsd,
        JSON.stringify(entry.outcome),
      ],
    );
  // 'allow' is the only decision this server ever observes — TrueForge simply
  // never calls the tool on Deny, so there is no path to record a denial here.
  for (let attemptNumber = 1; attemptNumber <= 2; attemptNumber++) {
    try {
      await withTimeout(attempt(), 1500);
      return;
    } catch (err) {
      const isLastAttempt = attemptNumber === 2;
      console.error(
        `[recovery_ledger] write attempt ${String(attemptNumber)} failed${isLastAttempt ? " — giving up (non-fatal)" : ", retrying"}:`,
        err instanceof Error ? err.message : err,
      );
      if (!isLastAttempt) await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

// Guards Finding #9 (double-counting): a charge already credited as recovered
// in a prior *live* run must not be counted again if the same batch is
// resubmitted — Stripe itself is safe to re-confirm, but our own sum isn't.
async function getAlreadyRecoveredChargeIds(): Promise<Set<string>> {
  if (!ledgerDb) return new Set();
  try {
    const result = await withTimeout(
      ledgerDb.query<{ charge_ids: string[] | null }>(
        `select charge_ids from public.recovery_ledger
         where action_type = 'retry_eligible_charges' and outcome ->> 'dry_run' = 'false'`,
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

// ---------------------------------------------------------------------------
// Domain config the read-only tool exposes. In a real build this would live in
// the "dunning-playbook" skill or a small config table — it's inlined here so
// the starter kit has zero required external state to run.
// ---------------------------------------------------------------------------
const DUNNING_THRESHOLDS = {
  max_auto_retry_attempts: 2,
  never_retry_decline_codes: ["stolen_card", "lost_card", "pickup_card", "fraudulent"],
  safe_to_retry_decline_codes: ["insufficient_funds", "do_not_honor", "processing_error", "try_again_later"],
  retry_backoff_hours: [24, 72],
  ltv_tiers: {
    high: { min_mrr_usd: 500, escalate_to_human_always: true },
    medium: { min_mrr_usd: 100 },
    low: { min_mrr_usd: 0 },
  },
  updated_at: "2026-08-01",
} as const;

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
        "Return the org's dunning/retry policy: which decline codes are safe to retry, which must " +
        "never be retried, max retry attempts, backoff schedule, and LTV tiers used to decide when a " +
        "human must be looped in regardless of $ amount.",
      inputSchema: {},
      annotations: {
        title: "Get dunning thresholds",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(DUNNING_THRESHOLDS, null, 2) }],
    }),
  );

  // --- Read-only tool: the actual customer-data read path -------------------
  server.registerTool(
    "get_customer_ltv",
    {
      title: "Get customer LTV data",
      description:
        "Look up plan, MRR, and LTV tier for a batch of Stripe customer IDs, joined from the " +
        "business-data table. Use this instead of the Supabase connector's execute_sql tool — that " +
        "tool is annotated destructive (it can run arbitrary SQL) and is excluded by this agent's " +
        "@read-only restriction, so it cannot return row data even for a plain SELECT.",
      inputSchema: {
        customer_ids: z.array(z.string()).min(1).describe("Stripe customer IDs to look up."),
      },
      annotations: {
        title: "Get customer LTV data",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ customer_ids }) => {
      if (!customersDb) {
        return {
          isError: true,
          content: [{ type: "text", text: "CUSTOMERS_DB_URL is not configured — cannot query customer data." }],
        };
      }
      const result = await customersDb.query(
        "select id, name, plan, mrr_usd, ltv_tier from public.customers where id = any($1::text[])",
        [customer_ids],
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
        "(e.g. insufficient_funds, do_not_honor) and are NOT flagged for mandatory human escalation. " +
        "Each charge must include the decline code it failed with — this server independently checks " +
        "it against never_retry_decline_codes and refuses those regardless of what the caller intended. " +
        "Moves real money when DRY_RUN is off — this call is annotated destructive and MUST be gated " +
        "behind human approval in the agent spec (require_approval_for_tools).",
      inputSchema: {
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
          .describe("Batch of charges to retry, each with the decline code it failed with."),
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
    async ({ charges, reason }) => {
      // Hard block, independent of the caller's classification — dunning-playbook step 4:
      // never retry these codes under any circumstance, even if the batch was approved.
      const neverRetry = new Set<string>(DUNNING_THRESHOLDS.never_retry_decline_codes);
      const blocked = charges.filter((c) => neverRetry.has(c.decline_code));
      const eligible = charges.filter((c) => !neverRetry.has(c.decline_code));
      const blockedResults = blocked.map((c) => ({
        id: c.charge_id,
        status: "blocked_never_retry" as const,
        decline_code: c.decline_code,
      }));

      if (DRY_RUN || !STRIPE_SECRET_KEY) {
        const results = eligible.map((c) => ({ id: c.charge_id, status: "simulated_retry_success" as const }));
        const amountUsd = eligible.reduce((sum, c) => sum + c.amount_usd, 0);
        await recordLedgerEntry({
          actionType: "retry_eligible_charges",
          reason,
          chargeIds: eligible.map((c) => c.charge_id),
          amountUsd,
          outcome: { dry_run: true, results: [...blockedResults, ...results] },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dry_run: true,
                  note: "DRY_RUN is on (or STRIPE_SECRET_KEY is unset) — no real Stripe call was made.",
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

      if (!STRIPE_SECRET_KEY.startsWith("sk_test_")) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "STRIPE_SECRET_KEY is not a test-mode key (must start with sk_test_) — refusing to make a live call.",
            },
          ],
        };
      }

      // Live path. PaymentIntents and Invoices need different Stripe calls — distinguish
      // by ID prefix (pi_ vs in_) rather than assuming every ID is a PaymentIntent.
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(STRIPE_SECRET_KEY);
      const liveResults = await Promise.all(
        eligible.map(async ({ charge_id, amount_usd }) => {
          try {
            const result = charge_id.startsWith("in_")
              ? await stripe.invoices.pay(charge_id)
              : await stripe.paymentIntents.confirm(charge_id);
            return { id: charge_id, status: result.status, amount_usd };
          } catch (err) {
            return { id: charge_id, status: "error", amount_usd, error: err instanceof Error ? err.message : String(err) };
          }
        }),
      );
      // Only a genuinely-paid result counts as "recovered" — confirm() can
      // return requires_action/requires_payment_method/canceled without
      // throwing, and only "paid" means an invoice actually collected.
      const isRecovered = (r: { id: string; status: string | null }) =>
        r.id.startsWith("in_") ? r.status === "paid" : r.status === "succeeded";
      // A charge already credited in a prior live run must not be counted
      // again if this exact batch gets resubmitted (Finding #9).
      const alreadyRecovered = await getAlreadyRecoveredChargeIds();
      const recoveredUsd = liveResults
        .filter((r) => isRecovered(r) && !alreadyRecovered.has(r.id))
        .reduce((sum, r) => sum + r.amount_usd, 0);
      await recordLedgerEntry({
        actionType: "retry_eligible_charges",
        reason,
        chargeIds: eligible.map((c) => c.charge_id),
        amountUsd: recoveredUsd,
        outcome: { dry_run: false, results: [...blockedResults, ...liveResults] },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ dry_run: false, reason, results: [...blockedResults, ...liveResults] }, null, 2),
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
        title: z.string(),
        description: z.string().describe("Root-cause summary with evidence: linked Sentry issue, affected charge IDs, $ at risk."),
        priority: z.enum(["urgent", "high", "medium", "low"]).default("high"),
        team_key: z.string().optional(),
        amount_at_risk_usd: z
          .number()
          .nonnegative()
          .describe("The $ at risk for this segment, from the same sandbox computation that sized it. Recorded for the recovery ledger."),
      },
      annotations: {
        title: "Open recovery ticket",
        readOnlyHint: false,
        destructiveHint: false, // a write, but not destructive — falls under @write, not @destructive
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, description, priority, team_key, amount_at_risk_usd }) => {
      if (DRY_RUN || !LINEAR_API_KEY) {
        const simulatedIssue = { id: `SIM-${randomUUID().slice(0, 8)}`, title, priority, team_key: team_key ?? LINEAR_TEAM_KEY };
        await recordLedgerEntry({
          actionType: "open_recovery_ticket",
          reason: description,
          linearIssueId: simulatedIssue.id,
          amountUsd: amount_at_risk_usd,
          outcome: { dry_run: true, simulated_issue: simulatedIssue },
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
          actionType: "open_recovery_ticket",
          reason: description,
          linearIssueId: issueCreate.issue?.identifier ?? issueCreate.issue?.id,
          amountUsd: amount_at_risk_usd,
          outcome: { dry_run: false, issue: issueCreate.issue },
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

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, dry_run: DRY_RUN });
});

// Public and aggregate-only so the cockpit's browser can call it directly — never row-level detail, never the MCP bearer token.
app.get("/stats", async (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (!ledgerDb) {
    res.json({ total_recovered_usd: 0, tickets_opened: 0, actions_count: 0 });
    return;
  }
  try {
    // DRY_RUN is the project-wide default (AGENTS.md) — rehearsal runs still
    // write to the ledger for their own audit trail, but must never inflate
    // the number a judge or stakeholder reads as real recovered revenue.
    const result = await ledgerDb.query<{ total_recovered_usd: string | null; tickets_opened: string; actions_count: string }>(
      `select
         coalesce(sum(amount_usd) filter (where action_type = 'retry_eligible_charges' and outcome ->> 'dry_run' = 'false'), 0) as total_recovered_usd,
         count(*) filter (where action_type = 'open_recovery_ticket' and outcome ->> 'dry_run' = 'false') as tickets_opened,
         count(*) filter (where outcome ->> 'dry_run' = 'false') as actions_count
       from public.recovery_ledger`,
    );
    const row = result.rows[0];
    res.json({
      total_recovered_usd: Number(row?.total_recovered_usd ?? 0),
      tickets_opened: Number(row?.tickets_opened ?? 0),
      actions_count: Number(row?.actions_count ?? 0),
    });
  } catch (err) {
    console.error("[/stats] query failed:", err instanceof Error ? err.message : err);
    res.status(503).json({ error: "stats temporarily unavailable" });
  }
});

app.post("/mcp", requireBearerToken, async (req, res) => {
  // Stateless mode: a fresh server + transport per request, closed when the
  // response ends. Simplest correct option for three low-traffic tools.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`recoup-actions-mcp listening on :${PORT} (DRY_RUN=${DRY_RUN})`);
  console.log(`Register in TrueForge as a remote MCP server at http(s)://<public-url>/mcp`);
  console.log("Header auth configured — send Authorization: Bearer <your MCP_SERVER_TOKEN> (never logged)");
});
