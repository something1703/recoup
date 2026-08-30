# Recoup — an SRE for revenue

Built on [TrueForge](https://trueforge.dev) for **The Agent Harness Hackathon**
(TrueFoundry × Qodo). Investigates a spike in failed payments, classifies root cause
across four independent sources, computes exact dollar impact in executed code, and
pauses for human approval before it touches a real charge or files a real ticket.

> Your uptime has an on-call engineer. Your revenue doesn't — until now.

**Try it live:** [the cockpit](https://recoup-cockpit-377323041120.asia-northeast1.run.app)
(type an investigation prompt, or copy one of the three desk prompts on screen) ·
[the landing page](https://recoup-landing-377323041120.asia-northeast1.run.app) ·
run it yourself with [Run it locally](#run-it-locally) below.

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
| A judge, or checking track/criteria fit | [`docs/JUDGING_FIT.md`](./docs/JUDGING_FIT.md), then [Run it locally](#run-it-locally) |
| Reviewing the system design | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Reviewing the UI/UX plan | [`docs/UI_UX_SPEC.md`](./docs/UI_UX_SPEC.md) |
| Prepping the demo | [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md) |
| A teammate who needs to create an account or hand over a key | [`docs/ACCESS_CHECKLIST.md`](./docs/ACCESS_CHECKLIST.md) |

**How this was built**: an AI coding agent worked the plan in
[`docs/PHASE_MAP.md`](./docs/PHASE_MAP.md) phase by phase, with a human directing,
reviewing, and holding the keys — [`AGENTS.md`](./AGENTS.md) is the standing brief that
agent works from, and every substantive change still went through a human-merged,
Qodo-reviewed pull request (see the evidence section below).

## Run it locally

Prereqs: Node ≥ 20, npm.

**The MCP server** (the agent's custom tools — runs fine with zero external accounts in
dry-run mode):

```bash
cd mcp-server
cp .env.example .env   # set MCP_SERVER_TOKEN to any random string; leave DRY_RUN=true
npm ci
npm run dev            # serves http://localhost:8890/mcp (bearer-token auth) and /stats
```

Without `CUSTOMERS_DB_URL`/`RECOVERY_LEDGER_DB_URL` set, the data-backed tools return
honest errors and the two write tools still demonstrate the full policy-check flow in
dry-run. To back them with real data, create a free Supabase project and run
`scripts/seed-supabase.sql` then `scripts/migrate-multi-tenant.sql` against it (each
file's header says exactly what it creates), and optionally import the real churn
population per `scripts/import-telco-population.ts`'s header.

**The cockpit** (the operator UI — needs a running TrueForge instance to talk to):

```bash
# TrueForge itself, if you don't have one: npx @truefoundry/trueforge
cd cockpit
npm ci
npm run build
TRUEFORGE_BASE_URL=http://localhost:8000 node server.mjs   # serves :8080, proxies /api
```

Then create an agent named `recoup` in TrueForge from [`agent-spec.json`](./agent-spec.json)
(Settings → Agents, or `client.agents.create`), register the three skills under
[`skills/`](./skills/), and add the MCP server from step 1 as a connector with header auth.

**The landing page** (static, no dependencies on the above):

```bash
cd landing && npm ci && npm run dev   # http://localhost:5174
```

**The pager** (optional — the agent starts itself): `scripts/patrol-dunning.ts` watches a
tenant's failed-charge count and opens the investigation session on breach, with no human
prompt. Self-triggered is not self-approved — the session still stops at the same
Allow/Deny gates. `npx tsx scripts/patrol-dunning.ts --simulate` fires one immediately for
a rehearsal.

## What TrueForge and Qodo are doing, concretely

- **TrueForge** runs the whole agent loop: the model, tool calls, four-way parallel
  sub-agent investigation, sandboxed code execution for the dollar-impact math, the
  approval pause before anything irreversible, and the session that survives a browser
  refresh mid-investigation. None of that is hand-rolled — it's the harness doing real
  work, visibly, in the demo.
- **Qodo** reviews every pull request in this repo before it merges. See
  `docs/CODE_QUALITY_BAR.md` for the exact workflow, and "Qodo Code Review Evidence"
  below for a real example.

## Bring your own tenant

Arcline, Ferro, and Meridian are demo tenants, not the whole story — the point is that all
three (a B2B SaaS, a subscription retailer, and a consumer telecom, three genuinely
different revenue shapes) run through the exact same `companies` row, the same MCP tools,
and the same three skills, with no per-tenant code branching. Adding a real fourth tenant
is the same three steps as adding Meridian was:

1. **Insert a company + policy.** A row in `public.companies` (`scripts/seed-supabase.sql`
   shows the shape) and a matching `public.dunning_policy` row — thresholds, LTV tiers,
   never-retry decline codes, all data, not code.
2. **Connect its real systems.** Point the Stripe/Sentry/GitHub/Linear catalog connectors
   at that tenant's own accounts in TrueForge's Settings → Connectors — these are live API
   integrations, not fixtures, so a real (or real test-mode) account works unmodified.
3. **Import its customer population**, if it's a usage/churn-shaped business rather than a
   pure Stripe-failures one: `scripts/import-telco-population.ts --company-id
   comp_your_company --csv path/to/your-customers.csv` (same column shape as
   `scripts/data/telco-customer-churn.csv`; see the script's own header comment to remap a
   different shape, and override `ltvTier()`'s cutoffs if your tenant's thresholds differ
   from the ones in its `dunning_policy` row).

Nothing about the agent, the skills, or the approval gates changes — `company_id` is a
parameter on every tool call, not a fixed identity baked into the code.

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

- PR: [#6 — Multi-tenant revenue platform: real Telco Churn data + account-health desk](https://github.com/something1703/recoup/pull/6)
- What Qodo surfaced: across three review rounds, 10 findings — all High severity, all
  fixed, not dismissed. The two worth calling out: `scripts/migrate-multi-tenant.sql`'s
  rerun guard could roll back its own non-destructive setup before reaching the guarded
  section, silently breaking idempotency on an already-migrated database; and
  `scripts/score-account-health-eval.ts` filtered out every `dry_run=true` ledger row,
  which — since dry-run is this project's default — meant a normal evaluation run scored
  every real classification as a false negative. Both fixed and re-verified.
- Review trail: three rounds (initial review → fixes → follow-up review, three times) all
  visible on the PR thread, ending with every finding marked resolved and a clean,
  conflict-free merge state.

## Status

Live, not just scaffolded. `mcp-server/` runs as `recoup-actions` on Cloud Run — its own
bearer-token auth confirmed rejecting unauthenticated/invalid requests, tenant-scoped
tools backed by real Postgres (Supabase), a public aggregate-only `/stats` endpoint.
`cockpit/` is deployed and drives a real TrueForge session end to end: verified live by
scripting an actual investigation through the browser — the agent reads the
`dunning-playbook` skill, calls real Stripe test-mode tools, and stops on a genuine
tool-approval gate before proceeding, exactly as `agent-spec.json` configures it. Three
skills exist (`dunning-playbook`, `refund-abuse-playbook`, `account-health-playbook`)
against a real, held-out IBM Telco Customer Churn population, scored by
`scripts/score-account-health-eval.ts`. `landing/` is deployed with the full case-file
design system. See `docs/DEMO_SCRIPT.md` for the walkthrough and `docs/PHASE_MAP.md` for
what's still open.
