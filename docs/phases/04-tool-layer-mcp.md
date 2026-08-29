# Phase 4: Tool layer — connecting the MCP catalog

## Objective

Connect every catalog MCP server the investigation needs, and verify each one with a real
tool call before moving on. This phase is config, not code — resist the urge to write any
custom integration here; if something feels like it needs code, it belongs in Phase 5.

## Prerequisites

- Phase 2 complete (TrueForge reachable).
- Access: Stripe (test mode), Sentry, Linear — see `docs/ACCESS_CHECKLIST.md` → "Before
  Phase 4." Supabase from Phase 3 should already exist.

## Sub-parts

### 4.1 Connect each catalog server
For each of Stripe, Supabase, Sentry, GitHub, Linear (Settings → Connectors in TrueForge):
- [ ] Connect via the catalog entry's OAuth (or PAT, for GitHub).
- [ ] Restrict `enable_tools` to match `agent-spec.json`: **Supabase, Sentry, and GitHub
      at `@read-only`** — they're evidence sources, never actors. Stripe and Linear stay
      broader because their write actions are covered by `require_approval_for_tools` in
      the agent spec (verified in Phase 8), and the actual retry/ticket writes go through
      the custom `recoup-actions` server anyway.

### 4.2 Verify, don't assume
For each connector:
- [ ] Run one real tool call through TrueForge's chat UI (e.g., "list my 5 most recent
      Stripe customers") and confirm real data comes back.
- [ ] Note anything that returns an auth error or empty result now — a connector that
      silently fails becomes a much worse problem to debug once four sub-agents depend on
      it in Phase 7.

### 4.3 Seed the Stripe test data
- [ ] Run `scripts/seed-stripe-test-data.ts` against the Stripe test-mode key from
      `docs/ACCESS_CHECKLIST.md`.
- [ ] Feed its printed customer IDs into Phase 3's Supabase seed, if not already done.

### 4.4 Seed Sentry and GitHub evidence — don't leave two sub-agents starved
The investigation is pitched as four-source correlation, but only Stripe/Supabase get
seed data above. Sub-agents 3 (Sentry) and 4 (GitHub) will otherwise report into an
empty project and an unrelated repo on every real run — half the fan-out would be
theater. Fix both directions:
- [ ] Seed a small fixture repo (e.g. `acme-billing-demo`) with a merged PR touching
      webhook/billing code, timestamped inside the incident window — gives GitHub
      deploy-correlation a real signal to find.
- [ ] Seed one error spike in the scratch Sentry project, first-seen timestamp lined up
      with the same window — gives Sentry error-correlation a real signal.
- [ ] Rehearse both directions: a run where the evidence says "ordinary card churn,
      nothing correlated" (the default fixture set), and a run where it says "this lines
      up with a deploy" (using this seeded fixture repo/error). Two credible scenarios,
      not one — this is also what makes `open_recovery_ticket`'s evidence links
      (Phase 6.5) real instead of placeholder text.

## MCP to use

The catalog connectors themselves (Stripe, Supabase, Sentry, GitHub, Linear) — see
`docs/MCP_TOOLKIT.md`'s first table. For GitHub specifically, use the **read-only toolset
variant** (`/readonly` on the endpoint) here, since this connector's job in this project is
correlation evidence, never a write.

## Exit criteria

- [ ] All five connectors show a successful real tool call, not just a "connected" status.
- [ ] Seeded Stripe test data exists and its customer IDs are reflected in the Phase 3
      Supabase table.
- [ ] Sentry and GitHub each have real seeded evidence, not just a live but empty
      connection.
