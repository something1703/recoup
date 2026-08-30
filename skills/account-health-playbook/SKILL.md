---
name: account-health-playbook
description: How to investigate renewal/expansion risk for a tenant's customer base — separate a customer whose usage decline is OUR fault (a bug or bad deploy quietly breaking their workflow) from one who is organically disengaging, and separate a real churn-risk profile from a customer who only looks risky on one signal. Use whenever asked to review account health, churn risk, renewal risk, or expansion opportunities.
---

# Account-Health Playbook

You are investigating renewal risk the way an SRE investigates a slow error-budget burn —
not a single outage, but a trend that needs a verdict: is this OUR fault (fixable, urgent)
or the customer's own trajectory (not fixable by us, but worth knowing about)? Get this
wrong in either direction and the wrong team gets paged: engineering chases a "bug" that's
just a customer's seasonal usage dip, or a real product regression gets read as ordinary
churn and nobody fixes it.

**This tenant's business shape determines which signals `get_account_usage` returns — read
which fields are populated, not just their values, before reasoning about them:**

- **comp_arcline_software** (and any SaaS-shaped tenant): `seats_included`, `seats_used`,
  `api_quota_30d`, `api_calls_30d`, `last_active_date`. The judgment call here is **bug vs.
  organic**: correlate a usage drop against Sentry/GitHub, the same way the dunning-playbook
  correlates a payment-failure spike.
- **comp_meridian_telecom**: `tenure_months`, `contract_type`, `payment_method`,
  `total_charges_usd` — real subscriber attributes, not product telemetry (this tenant has
  no seats or API calls). The judgment call here is **multi-signal weighing**: no single
  field determines risk on its own — a month-to-month contract alone doesn't mean much for
  someone at 60 months' tenure, but the same contract type at 2 months' tenure combined with
  a manual payment method is a different picture. Weigh them together; don't threshold on one.

Fields that don't apply to the current tenant come back `null` — that means "not
applicable," not "zero" or "missing data." Never treat a null SaaS field as a red flag on a
Meridian account or vice versa.

## 1. Triage — pull the working set

If you already have specific customer IDs (a human flagged them, or they came out of a
dunning/refund investigation), skip straight to `get_account_usage`. Otherwise, discover a
shortlist with `list_customers` first — **do not go looking for customer IDs in the Stripe
tools.** Not every tenant's customers exist in Stripe: comp_meridian_telecom's real
subscriber population has no Stripe presence at all (it is DB-only, imported from a real
dataset), so a Stripe search for its accounts will come back empty or irrelevant. `list_customers`
is the tenant-agnostic discovery path — narrow it with `ltv_tier` or `contract_type` to get a
plausible starting shortlist (e.g. month-to-month contracts for comp_meridian_telecom), then
call `get_account_usage` on that shortlist (max 50 per call — if reviewing more, batch it;
never try to reason about a whole tenant's population at once in your own context — that is
both slow and unnecessary, the same discipline as the dunning-playbook's batch-shaped tools).

## 2. Classify

**For comp_arcline_software (bug vs. organic):** `get_account_usage` gives you one current
30-day snapshot, not a history — there is no prior-period number to diff against, so don't
reason as if you can see a trend line. What you actually have: a utilization ratio
(`api_calls_30d` against `api_quota_30d`, `seats_used` against `seats_included`) and
`last_active_date`, which IS a real point-in-time fact you can compare against other
timestamps. Delegate to parallel sub-agents, merge findings:

1. **Utilization sizer** — for each account, compute the utilization ratio and flag accounts
   using well below what their plan provisions for, noting how many days since
   `last_active_date`.
2. **Sentry error correlation** — search for an error spike whose window is close to a
   flagged account's `last_active_date` (recent inactivity lining up with a recent error is
   the real signal; a low ratio with a `last_active_date` from months ago is just an account
   that has always been quiet, not a decline).
3. **GitHub deploy correlation** — check for a release touching the area of the product that
   account depends on, close to the same `last_active_date` window.

Read together: low utilization whose `last_active_date` lines up with an error spike or a
relevant deploy is OUR bug driving disengagement — urgent, ours to fix. Low utilization with
no such correlation is the customer's own trajectory — worth flagging for customer success,
not engineering. If you can't establish a timing correlation either way, say so rather than
guessing — you have a snapshot, not a trend, and the classification should reflect that.

**For comp_meridian_telecom (multi-signal weighing):** there is no Sentry/GitHub signal to
correlate against — this tenant's risk classification rests entirely on the customer's own
attributes weighed together: `contract_type` (month-to-month carries materially more real
churn risk than a one/two-year contract — a real, published pattern in subscription
businesses, not specific to this dataset), `payment_method` (a manual method carries more
friction and risk than an automatic one), `tenure_months` (very early tenure is the highest-
risk window), and `total_charges_usd` relative to `tenure_months` (a high lifetime value
despite short tenure is a different risk profile than the same total spread over years).
None of these alone is a verdict — call it a genuine risk only when multiple signals agree,
and say so explicitly when they don't.

If Sentry or GitHub aren't connected, say so explicitly for comp_arcline_software rather
than guessing at a bug/organic split you can't support.

## 3. Quantify — do the math in the sandbox, not in prose

Write a short Python script (Code Mode) that joins the flagged accounts against
`get_customer_ltv`, groups by risk segment and LTV tier, and prints: total $ MRR at risk per
segment, count of accounts per segment, and the top accounts by MRR in each. Computed
figures only — never eyeball a risk count from raw JSON in conversation.

## 4. Decide — always ends at a human

- **Bug-driven usage drop**: propose `open_recovery_ticket` as an engineering bug ticket —
  linked Sentry/GitHub evidence, the affected `customer_ids`, and $ MRR at risk.
- **Genuine multi-signal churn risk** (comp_meridian_telecom) or **organic disengagement**
  (comp_arcline_software): propose `open_recovery_ticket` as a customer-success review
  ticket — the flagged `customer_ids`, the signals that drove the call, and $ MRR at risk.
  This is a heads-up for a human relationship-owner, never an action taken on the account
  directly (no auto-discount, no auto-outreach — this playbook has no tool for either).
- Always pass the flagged `customer_ids` on the ticket, even though the field is optional —
  it is what lets a later, separate process check this call against what actually happened.
  Do not skip it because the description already names the accounts in prose.
- Both segments can apply in the same run — segment first, then file the matching ticket
  per segment.

## 5. Report

Close with a summary a non-technical stakeholder can act on: what you reviewed, how many
accounts and how much MRR fall into each segment, the evidence for each call, and what you
need approved. Prefer a small table (Generative UI): segment, count, $ MRR, proposed action.

## Guardrails

- Never call `open_recovery_ticket` speculatively — only once stage 2's classification
  supports it, and only ever as a ticket, never a direct action on the customer.
- If the signals disagree or you're not confident in the classification, say so and ask,
  rather than defaulting to either segment.
- Do not threshold on a single field (e.g. "idle > 30 days = churn risk") and call that a
  classification — that is a lookup, not a judgment call, and belongs in a dashboard, not an
  agent investigation. The point of this playbook is weighing several imperfect signals
  together where no single one is decisive.
