# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Vite + React + TypeScript + Tailwind for the landing page, deployed to Cloud Run. Chosen to match the cockpit's exact existing stack (same component/tooling conventions, same deploy story) and because docs/UI_UX_SPEC.md's already-chosen libraries for this page (Aceternity UI, Magic UI) are React component libraries — a non-React stack would fight the spec, not serve it. Cloud Run keeps every surface (trueforge, recoup-actions, cockpit, landing page) on the same GCP project this session already provisioned, rather than adding a second hosting provider for one static site.

## Users

Primary: an ops/finance stakeholder at a subscription business (SaaS, subscription retail, or consumer-subscription telecom) evaluating whether to adopt Recoup — someone who currently either runs a blanket dunning-retry schedule or has a person manually digging through a payments dashboard, and is deciding whether an investigative agent is worth trusting with revenue-adjacent decisions.

This same page is also what a hackathon judge sees in their first ~15 seconds evaluating the submission (docs/UI_UX_SPEC.md, docs/JUDGING_FIT.md) — the two audiences are treated as one: write for the real buyer, and the judge reads the page as evidence of genuine product thinking rather than a submission-specific pitch.

## Product Purpose

Recoup is an SRE-style investigation agent for a subscription business's revenue department, built on the TrueForge harness. It investigates a revenue-impacting incident (a failed-payment spike, a refund wave, a renewal-risk signal) the way an SRE investigates an uptime incident: pull evidence from multiple independent sources, correlate, classify root cause, quantify dollar impact in executed code, then pause for a human to approve before anything real happens. It does not act on its own judgment; every consequential action is gated.

Recoup now covers three desks, not one: dunning/failed-payments (card-level vs. platform-level root cause), refund-abuse (serial abuse vs. a product-failure wave), and account-health (bug-driven usage decline vs. organic disengagement, or genuine multi-signal churn risk). Each desk is a swappable skill file, not separate hardcoded logic — the harness/gate/ledger architecture underneath is identical across all three.

## Positioning

Every classification a competitor's demo would show is provable, not narrated: dollar figures are computed in sandboxed executed code (never eyeballed from raw JSON), every write action is human-gated with zero exceptions, and — the mechanism a similarly-scoped competitor could not truthfully copy without doing the same work — the account-health desk's real-data tenant (comp_meridian_telecom) is seeded from the actual IBM Telco Customer Churn dataset: 7,043 real anonymized subscribers with a real recorded churn outcome, held out from the agent in a table no agent-facing database role can read. The agent's classifications are scored against that real outcome (precision/recall via scripts/score-account-health-eval.ts), not just demonstrated on a scenario built to be solved.

Recoup also runs this for multiple tenant companies with independently-calibrated policy (each tenant's escalation thresholds are derived from that tenant's own real revenue distribution, not a single global constant) — positioning it as infrastructure a platform runs for many client businesses, not one company's internal tool.

## Operating Context

Multi-tenant: three real tenant companies today (comp_arcline_software — B2B SaaS, comp_ferro_commerce — subscription retail, comp_meridian_telecom — consumer telecom, real dataset), each with its own `dunning_policy` row and its own customer population. An investigation is always scoped to one company_id.

Real infrastructure throughout: real Stripe test-mode charges/refunds/subscriptions, a real Supabase Postgres backing store with least-privilege roles (a read-only role for the agent, a separate service role for the tool server's own writes, a third eval-only role for scoring — none overlapping), deployed on GCP Cloud Run. `DRY_RUN=true` is the project-wide default; a rehearsal run never inflates the numbers shown as real.

Every code change to this project goes through a Qodo-reviewed pull request; a human performs the actual merge.

## Capabilities and Constraints

- Two gated write tools total across all three desks: `retry_eligible_charges` (batch-shaped, one approval per batch) and `open_recovery_ticket` (routes to a human relationship-owner or engineer — never a direct customer-facing action). No desk has a third write path.
- Read tools (`get_customer_ltv`, `get_account_usage`, `list_customers`, `get_dunning_thresholds`) are capped per call (max 50 IDs) by design — investigations work in bounded batches, never pull a whole tenant's population into the agent's own context.
- Sentry and GitHub deploy-correlation are only meaningfully available for comp_arcline_software today (comp_meridian_telecom's real dataset has no corresponding codebase to correlate against — its account-health judgment is multi-signal weighing instead, not bug correlation). Sentry/Linear connectors are not yet connected in the live agent as of this writing.
- `get_account_usage` exposes one current 30-day/point-in-time snapshot, not a usage history — any account-health narrative should not imply a trend line the tool can't actually support.

## Brand Commitments

Name: Recoup. Established tagline (README.md, docs/UI_UX_SPEC.md): "An SRE for your revenue." Landing page's prior spec already commits to a globe-centric hero visualizing recovered payments lifting off in real time — treat as a strong existing direction, not a blank slate, unless the user says otherwise.

## Evidence on Hand

- Real Stripe test-mode fixtures: 8 dunning-incident customers with real decline codes, 3 refund-abuse customers with real refund cycles.
- The real IBM Telco Customer Churn dataset (`scripts/data/telco-customer-churn.csv`, 7,043 rows) imported as comp_meridian_telecom's population, with a real held-out `Churn` outcome per customer.
- A working, deployed cockpit (approval card, incident banner, cumulative recovery-$ stat) built on `@truefoundry/trueforge-ui`.
- Existing docs this page's copy must stay consistent with, not contradict: `README.md`, `docs/ARCHITECTURE.md`, `docs/DEMO_SCRIPT.md`, `docs/JUDGING_FIT.md`, `docs/UI_UX_SPEC.md`.
- No real customer testimonials, case studies, press mentions, or third-party benchmarks exist. None should be fabricated or implied — the "involuntary churn" industry statistic docs/UI_UX_SPEC.md calls for must be a real, citable figure, sourced at write time, not invented.

## Product Principles

1. Every action that touches money or files a ticket is gated behind human approval — no auto-retry, no auto-discount, no direct customer-facing action, ever, regardless of confidence.
2. A dollar figure is always the output of executed code, never a number typed or eyeballed into a response.
3. Classify before acting — root cause determines the proposed action; nothing is proposed speculatively "to see what happens."
4. Domain judgment lives in one swappable skill file per desk; the harness, gate, and audit ledger underneath never change when a desk is added or swapped.
5. Prefer a real, checkable outcome over a narrated one — where a claim can be verified against real data (a real dataset's real churn outcome, a real live deploy, a real Qodo review), it is, rather than asserted.

## Accessibility & Inclusion

Keyboard focus visibility is already implemented on the cockpit's approval controls (`:focus-visible` styling, `cockpit/src/index.css`) — carry the same standard into the landing page's interactive elements. No other product-specific accessibility requirement has been established yet.
