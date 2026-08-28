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
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 8890);
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN ?? "dev-only-change-me";
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_TEAM_KEY = process.env.LINEAR_TEAM_KEY ?? "OPS";

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

  // --- Gated write tool: retries a batch of eligible charges ---------------
  server.registerTool(
    "retry_eligible_charges",
    {
      title: "Retry eligible charges",
      description:
        "Retry a batch of failed Stripe charges/invoices that were classified as safe-to-retry " +
        "(e.g. insufficient_funds, do_not_honor) and are NOT flagged for mandatory human escalation. " +
        "Moves real money when DRY_RUN is off — this call is annotated destructive and MUST be gated " +
        "behind human approval in the agent spec (require_approval_for_tools).",
      inputSchema: {
        charge_ids: z.array(z.string()).min(1).describe("Stripe PaymentIntent or Invoice IDs to retry."),
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
    async ({ charge_ids, reason }) => {
      if (DRY_RUN || !STRIPE_SECRET_KEY) {
        const results = charge_ids.map((id) => ({ id, status: "simulated_retry_success" as const }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dry_run: true,
                  note: "DRY_RUN is on (or STRIPE_SECRET_KEY is unset) — no real Stripe call was made.",
                  reason,
                  results,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Live path — adapt to your real dunning flow. PaymentIntent.confirm() is the
      // simple case for a one-off charge with a saved payment method; for subscription
      // invoices, prefer stripe.invoices.pay(invoiceId) instead. Swap as needed.
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(STRIPE_SECRET_KEY);
      const results = await Promise.all(
        charge_ids.map(async (id) => {
          try {
            const intent = await stripe.paymentIntents.confirm(id);
            return { id, status: intent.status };
          } catch (err) {
            return { id, status: "error", error: err instanceof Error ? err.message : String(err) };
          }
        }),
      );
      return { content: [{ type: "text", text: JSON.stringify({ dry_run: false, reason, results }, null, 2) }] };
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
      },
      annotations: {
        title: "Open recovery ticket",
        readOnlyHint: false,
        destructiveHint: false, // a write, but not destructive — falls under @write, not @destructive
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, description, priority, team_key }) => {
      if (DRY_RUN || !LINEAR_API_KEY) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dry_run: true,
                  note: "DRY_RUN is on (or LINEAR_API_KEY is unset) — no real Linear ticket was created.",
                  simulated_issue: { id: `SIM-${randomUUID().slice(0, 8)}`, title, priority, team_key: team_key ?? LINEAR_TEAM_KEY },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Live path — minimal Linear GraphQL call. Resolve a real team UUID from
      // `team_key` via a `teams` query first in production; hardcode for the demo.
      const priorityMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
      const query = `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { id identifier url } }
      }`;
      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: LINEAR_API_KEY },
        body: JSON.stringify({
          query,
          variables: { input: { title, description, priority: priorityMap[priority], teamId: team_key ?? LINEAR_TEAM_KEY } },
        }),
      });
      const json = await response.json();
      return { content: [{ type: "text", text: JSON.stringify({ dry_run: false, linear_response: json }, null, 2) }] };
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
  console.log(`Header auth: Authorization: Bearer ${MCP_SERVER_TOKEN}`);
});
