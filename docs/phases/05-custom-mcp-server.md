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

## MCP to use

**Google Cloud Run MCP** for the deploy (5.2), same as Phase 2. This server itself
(`recoup-actions`) is the one piece of custom, non-catalog tooling in this project — see
`docs/MCP_TOOLKIT.md` for why a narrow custom server was the right call here instead of a
broader generic one.

## Exit criteria

- [ ] `recoup-actions` is live on Cloud Run, registered in TrueForge, and its two gated
      tools have been confirmed — by actually triggering them once — to pause for approval.
