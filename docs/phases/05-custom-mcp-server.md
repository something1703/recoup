# Phase 5: Custom MCP server — recoup-actions

## Objective

Deploy the one piece of custom tooling this project needs: a narrow, batch-shaped,
correctly-annotated MCP server for the two gated actions. The server code already exists
in `mcp-server/` (built, dependency-installed, type-checked, and smoke-tested against a
live MCP handshake) — this phase is about deploying and wiring it, and treating the
existing code as a verified starting point, not a first draft to rewrite from scratch.

## Prerequisites

- Phases 3 and 4 complete (the data it queries and the services it acts on both exist and
  are verified).
- Access: none new — reuses Stripe/Linear credentials from Phase 4 and the GCP project
  from Phase 2.

## Sub-parts

### 5.1 Review before extending
- [ ] Read `mcp-server/src/index.ts` in full before changing anything — understand why
      `DRY_RUN` defaults true, why the tools are batch-shaped, and how the annotations map
      to TrueForge's approval selectors (`docs/ARCHITECTURE.md` gotcha #1).

### 5.2 Deploy
- [ ] Deploy to Cloud Run via the Cloud Run MCP server (see `docs/MCP_TOOLKIT.md`).
- [ ] Set `MCP_SERVER_TOKEN` to a real random value in Secret Manager, `DRY_RUN=true`.
- [ ] Confirm `/healthz` responds and a `tools/list` call against the deployed URL returns
      all three tools with their annotations intact.

### 5.3 Register in TrueForge
- [ ] Settings → Connectors → Add MCP Server, header auth,
      `Authorization: Bearer <MCP_SERVER_TOKEN>`, name it exactly `recoup-actions` (the
      agent spec in Phase 6 references this name).

### 5.4 Deliberate approval-gate test
- [ ] Before trusting this in later phases, deliberately try to get an agent to call
      `retry_eligible_charges` through TrueForge's chat UI and confirm it actually pauses
      for approval. Do this now, not for the first time during Phase 10 rehearsal.

### 5.5 Harden the money path further
The approval gate stops an *unapproved* action; these close the remaining gap between
"the agent claims X" and "the server independently verified X" — defense in depth for
exactly the two tools that move money or file tickets:
- [ ] `retry_eligible_charges` currently trusts the caller-supplied `decline_code`. Have
      the server fetch each charge from Stripe itself (one read call, test mode) and
      check the *actual* decline code before retrying — the agent can no longer retry a
      stolen card even by misreporting its own classification.
- [ ] Enforce the `escalate_to_human_always` LTV-tier rule server-side too: look up each
      charge's customer tier (the Phase 3 Supabase table, read-only) and refuse to retry
      if it's flagged, instead of relying on the skill alone to have excluded it.
- [ ] Add an idempotency key (Stripe's `Idempotency-Key` header) per charge in the live
      retry path, so a double-click or a replayed session can't double-charge.
- [ ] Cap batch size (reject e.g. `charges.length > 50`) as a blast-radius limit.
- [ ] Point `get_dunning_thresholds` at the Phase 3.3 `dunning_policy` table instead of
      the inline const, now that this server needs a Supabase connection anyway for the
      LTV lookup above — see `docs/ARCHITECTURE.md`'s addendum on this connection.

### 5.6 Recovery ledger
- [ ] Append every proposed batch/ticket, the human's Allow/Deny decision, the agent's
      stated `reason`, and the outcome (per-charge status, or the created issue) to the
      Phase 3.3 `recovery_ledger` table. This is both a real audit trail a fintech would
      actually require, and the data source for the cockpit's cumulative "$ recovered"
      stat (Phase 9.7).

### 5.7 Unit tests on the money path
- [ ] Add Vitest (or similar) covering: the never-retry decline-code filter, the
      server-side decline-code/LTV verification from 5.5, the bearer-auth middleware,
      the `sk_test_` guard, and the Linear failure-detection path (`response.ok` /
      GraphQL errors / `issueCreate.success`). Zero tests exist on the code that moves
      money today — wire this into the Phase 1.5 CI workflow once it exists.

## MCP to use

**Google Cloud Run MCP** for the deploy (5.2), same as Phase 2. This server itself
(`recoup-actions`) is the one piece of custom, non-catalog tooling in this project — see
`docs/MCP_TOOLKIT.md` for why a narrow custom server was the right call here instead of a
broader generic one.

## Exit criteria

- [ ] `recoup-actions` is live on Cloud Run, registered in TrueForge, and its two gated
      tools have been confirmed — by actually triggering them once — to pause for approval.
- [ ] Decline code and LTV tier are independently verified server-side, not just trusted
      from the caller.
- [ ] A recovery ledger exists and the money-path unit tests pass (and run in CI).
