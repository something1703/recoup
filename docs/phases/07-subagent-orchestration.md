# Phase 7: Sub-agent orchestration & Code Mode

## Objective

Make the four-way parallel investigation and the sandboxed dollar-impact computation
reliable and reproducible — not "usually works," but confirmed across repeated runs.

## Prerequisites

- Phase 6 complete.
- Access: none new. Confirm the Daytona sandbox provider is configured in Settings →
  Sandbox providers (free tier) if not already done in Phase 2.

## Sub-parts

### 7.1 Confirm real parallel delegation
- [ ] Run the investigation prompt and check the agent-steps panel for four distinct
      sub-agent threads (Stripe / Supabase / Sentry / GitHub), not one long serial
      monologue. If it's not delegating, tighten the instructions in `agent-spec.json` —
      dynamic sub-agents are on by default, but the model still has to be prompted to see
      the task as four independent angles.
- [ ] Repeat the run 3 times; the delegation pattern should be consistent, not a coin flip.

### 7.2 Code Mode correctness
- [ ] Confirm the sandbox script that joins Stripe failures against the Supabase customer
      table produces the correct $-at-risk figure — check it by hand against the seeded
      fixture data at least once.
- [ ] Confirm raw per-charge JSON does not appear verbatim in the agent's final report —
      only the aggregated segment table should reach the user (this is both a UX and a
      demo-realism requirement, see `docs/DEMO_SCRIPT.md`).

### 7.3 Robustness
- [ ] Test what happens when one of the four sources is unreachable (temporarily
      disconnect one connector) — the skill should say so explicitly and proceed on the
      remaining evidence, not silently guess or fail the whole run.

### 7.4 Automated eval harness
- [ ] Fixture data is fixed and ground truth is known (exact $ at risk, exactly which
      charges are safe-to-retry) — write a small SDK-driven script that runs the
      investigation N times and scores: did it delegate four ways, did the computed $
      match ground truth exactly, did it ever propose retrying the seeded stolen-card
      charge. Run it against both configured models.
- [ ] Record the results — this becomes real evidence for the Field Report track (a
      scored model comparison, not a prose "it worked"); see `docs/DEMO_SCRIPT.md` and
      TrueForge's own benchmarking docs for a citable frame.

### 7.5 Self-triggering investigation (optional, on-brand)
- [ ] Recoup's own pitch is "an SRE for revenue" — SREs get paged, they don't get asked.
      Add a small watcher (a Cloud Scheduler-triggered Cloud Run job) that polls
      Stripe's failed-charge count against `get_dunning_thresholds`' baseline and starts
      an investigation session via the TrueForge SDK/HTTP API on breach, instead of
      always waiting for a human prompt.
- [ ] If built, the cockpit should visibly show a session that started itself — a
      stronger "agent," not "tool," demo beat than any manually-triggered run.

## MCP to use

The four catalog connectors from Phase 4, now exercised through sub-agents rather than
directly. No new servers this phase.

## Exit criteria

- [ ] Three consecutive runs show real four-way parallel delegation and a correct,
      hand-verified dollar figure.
- [ ] A deliberately-broken connector produces a graceful degraded report, not a crash or
      a fabricated number.
- [ ] The eval harness runs against both models and its results are recorded.
