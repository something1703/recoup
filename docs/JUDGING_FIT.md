# Judging fit

## Criteria mapping

| Criterion | Evidence in this build |
|---|---|
| Potential impact | Involuntary-churn recovery is a real line item on a SaaS P&L — "how many dollars did the agent save this week" is a number a CFO cares about, not just an engineer. |
| Creativity & originality | Incident-response pattern applied to revenue instead of uptime; explicit two-path branching (retry vs. escalate) driven by policy, not a coin flip; four-source correlation (Stripe/Supabase/Sentry/GitHub) borrowed from real SRE root-causing practice. |
| Technical excellence | Code Mode used for real (not cosmetic) arithmetic; custom MCP server with correct tool annotations; four-way sub-agent fan-out; session-survives-reconnect demoed live; a themed UI SDK app with a genuinely custom (not default) approval component. |
| Use of sponsor tools | 5 catalog MCP servers + 1 custom one, sandbox, skills, Generative UI, in-chat OAuth, and the UI SDK — TrueForge is doing real work end to end, not wrapping a single model call. Qodo review trail on every PR (see `docs/CODE_QUALITY_BAR.md`). |
| Control and safety | The single loudest beat in the video: the agent proposes retrying real money and the run **stops** until a human clicks Allow — with the cockpit's own high-stakes card, not the generic one. Never-retry decline codes are hard-blocked in the skill regardless of $ amount. |
| Presentation | The cockpit itself, a Generative UI summary table, a crisp 3-minute video (`docs/DEMO_SCRIPT.md`), a README a stranger can actually run. |

## Track-by-track fit

- **Universal Exports (job interviews):** falls out of doing well elsewhere — nothing to
  submit separately.
- **Double-O (Best Use of TrueForge):** the primary target. `docs/ARCHITECTURE.md`'s
  layer table is the checklist — real MCP tools, sandboxed code that's load-bearing, a
  real approval gate, sub-agents, a custom skill.
- **Q Branch (Best Code Quality):** non-negotiable regardless of track — see
  `docs/CODE_QUALITY_BAR.md` and the Qodo Code Review Evidence template in `README.md`.
  Do this from the very first commit (Phase 1), not retroactively at the end.
- **Savile Row (Best UI):** a core deliverable, not a stretch — `cockpit/` is a themed,
  single-purpose front end with a genuinely bespoke approval experience for the two gated
  tools, which is exactly "shows what it's waiting on and asks before the irreversible
  step," judged on the running project and the demo video, not a screenshot.
- **Field report (blog post):** write it during Phase 10, not last — an honest "what
  broke" paragraph is more interesting than a polished-but-generic one, and TrueForge's
  benchmarking docs are a legitimate, citable hook if the write-up compares models.
- **Radio traffic (social posts):** start capturing clips as early as Phase 5–7, not
  Phase 10 — see `docs/phases/07-subagent-orchestration.md` onward for good moments to
  screen-record as they happen.
