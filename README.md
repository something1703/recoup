# Recoup — an SRE for revenue

Built on [TrueForge](https://trueforge.dev) for **The Agent Harness Hackathon**
(TrueFoundry × Qodo). Investigates a spike in failed payments, classifies root cause
across four independent sources, computes exact dollar impact in executed code, and
pauses for human approval before it touches a real charge or files a real ticket.

> Your uptime has an on-call engineer. Your revenue doesn't — until now.

## Why this exists

A large slice of SaaS churn isn't a customer choosing to leave — it's a card expiring, a
bank declining, a webhook silently breaking after a deploy. It's called *involuntary
churn*, and today it's handled either by a dumb blanket retry schedule or by someone
manually digging through a payments dashboard. Engineering solved the equivalent problem
for uptime decades ago: investigate from multiple sources, correlate, classify, quantify,
act, write it up. Recoup applies that discipline to revenue instead.

The deeper point: the domain expertise lives in **one file** —
[`skills/dunning-playbook/SKILL.md`](./skills/dunning-playbook/SKILL.md). Swap it for a
refund-abuse playbook or a chargeback-defense playbook and every other layer in this
project stays identical. This isn't a payments bot; it's a pattern for turning any written
policy into a gated, investigative agent.

## Start here

| If you are... | Go to |
|---|---|
| The coding agent building this | [`AGENTS.md`](./AGENTS.md) — read it first, then [`docs/PHASE_MAP.md`](./docs/PHASE_MAP.md) |
| A teammate who needs to create an account or hand over a key | [`docs/ACCESS_CHECKLIST.md`](./docs/ACCESS_CHECKLIST.md) |
| Reviewing the system design | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Reviewing the UI/UX plan | [`docs/UI_UX_SPEC.md`](./docs/UI_UX_SPEC.md) |
| Prepping the demo | [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md) |
| A judge, or checking track/criteria fit | [`docs/JUDGING_FIT.md`](./docs/JUDGING_FIT.md) |

## What TrueForge and Qodo are doing, concretely

- **TrueForge** runs the whole agent loop: the model, tool calls, four-way parallel
  sub-agent investigation, sandboxed code execution for the dollar-impact math, the
  approval pause before anything irreversible, and the session that survives a browser
  refresh mid-investigation. None of that is hand-rolled — it's the harness doing real
  work, visibly, in the demo.
- **Qodo** reviews every pull request in this repo before it merges. See
  `docs/CODE_QUALITY_BAR.md` for the exact workflow, and the "Qodo Code Review Evidence"
  section below once real PRs exist.

## Repo layout

```
recoup/
├── AGENTS.md                    # Read this if you're the coding agent
├── README.md                    # You are here
├── agent-spec.json              # The TrueForge agent manifest
├── docs/
│   ├── PHASE_MAP.md             # The 10-phase build order and dependencies
│   ├── phases/                  # 01 through 10 — one file each, see below
│   ├── ARCHITECTURE.md
│   ├── MCP_TOOLKIT.md           # Every MCP server used, and what it's for
│   ├── ACCESS_CHECKLIST.md      # Every account/key a human needs to create
│   ├── UI_UX_SPEC.md
│   ├── CODE_QUALITY_BAR.md
│   └── DEMO_SCRIPT.md
├── mcp-server/                  # Custom "recoup-actions" MCP server (built, verified)
├── cockpit/                     # Custom UI SDK app (built, verified)
├── skills/dunning-playbook/     # The investigation procedure — this project's real IP
└── scripts/                     # Demo-data seed scripts
```

## The 10 build phases

1. [Foundations — repo, Qodo, operating contract](./docs/phases/01-foundations-and-repo.md)
2. [Harness & cloud infrastructure (GCP)](./docs/phases/02-harness-and-infra.md)
3. [Data layer](./docs/phases/03-data-layer.md)
4. [Tool layer — connecting the MCP catalog](./docs/phases/04-tool-layer-mcp.md)
5. [Custom MCP server — recoup-actions](./docs/phases/05-custom-mcp-server.md)
6. [The brain — skill & agent spec](./docs/phases/06-skill-and-agent-brain.md)
7. [Sub-agent orchestration & Code Mode](./docs/phases/07-subagent-orchestration.md)
8. [Approval & safety layer](./docs/phases/08-approval-safety-layer.md)
9. [UI/UX — landing page & cockpit](./docs/phases/09-ui-ux-cockpit-and-landing.md)
10. [Hardening, Qodo, demo & launch](./docs/phases/10-hardening-qodo-demo-launch.md)

Each phase file has its own prerequisites, numbered sub-parts, which MCP server to use,
what access the human needs to provide, and exit criteria. Work them in order —
`docs/PHASE_MAP.md` has the dependency graph if you need to see why.

## Qodo Code Review Evidence

*(Fill in once a real PR exists — see `docs/CODE_QUALITY_BAR.md` for the required format.)*

```markdown
- PR: <link to a representative merged PR with real hackathon code>
- What Qodo surfaced: <1–2 sentences — a real finding, and what you did about it>
- Review trail: initial review → decision → follow-up review, visible on the PR thread.
```

## Status

Scaffolded and verified: `mcp-server/` (builds, type-checks, smoke-tested against a live
MCP handshake), `cockpit/` (builds, type-checks against the real published
`@truefoundry/trueforge-ui`), `skills/dunning-playbook/SKILL.md`, `agent-spec.json`, and
the demo-data seed scripts. Everything else is planned in `docs/phases/` and not yet
built — that's the work ahead.
