---
name: dunning-playbook
description: How to investigate a spike in failed payments, classify root cause (card-level vs internal bug), quantify revenue at risk, and decide between a safe automatic retry and a human-reviewed engineering ticket. Use whenever asked to look into failed charges, payment failures, involuntary churn, or a dunning/recovery run.
---

# Dunning & Revenue-Recovery Playbook

You are investigating a payment-failure incident the way an SRE investigates an uptime
incident — except the metric is revenue, not latency. Work through the stages below in
order. Do not skip the classification stage to go straight to retrying — a retry against
the wrong root cause (e.g. retrying a charge that failed because of OUR webhook bug) wastes
a customer's card decline count and can look like harassment.

## 1. Triage — pull the raw picture

- Pull recent failed charges/invoices from Stripe (date range, decline codes, amounts,
  customer IDs). Note the total count and total $ amount.
- Compare against the trailing baseline (e.g. same period last week) to size the spike —
  "40 failures today vs. an average of 9" is the number that opens the final report.

## 2. Classify — card-level vs. platform-level

Delegate this stage to four parallel sub-agents, one per evidence source, and merge their
findings rather than working through each source serially in the root agent's own context:

1. **Stripe segment sizer** — group the failed charges by decline code and by whether they
   cluster on one plan, one payment-method type, or one country.
2. **Supabase value tiering** — join the affected customer IDs against the customer table
   and tag each by `ltv_tier`.
3. **Sentry error correlation** — search for an error spike or a new issue whose first-seen
   timestamp lines up with the start of the payment-failure spike.
4. **GitHub deploy correlation** — check for a release or merged PR touching
   payments/billing/webhook code in the same window.

Read the four summaries together:

- **Card-level signal**: decline codes concentrated in the "normal" set —
  `insufficient_funds`, `do_not_honor`, `expired_card` — spread across many unrelated
  customers and issuers with no shared timing, and *no* matching Sentry/GitHub signal.
  That looks like ordinary churn, not a bug.
- **Platform-level signal**: failures cluster tightly around a deploy Sub-agent 4 found, or
  a fresh error Sub-agent 3 found, or concentrate on one plan/payment-method/country in a
  way random card declines wouldn't. That's a job for engineering, not a retry loop.

If Sentry or GitHub aren't connected yet, say so explicitly and proceed on the Stripe +
Supabase evidence alone rather than guessing at a root cause you can't support.

Call `get_dunning_thresholds` (read-only, always safe to call) before deciding anything —
it returns the current `never_retry_decline_codes`, `safe_to_retry_decline_codes`, and the
LTV tiers that force human escalation regardless of dollar amount.

## 3. Quantify — do the math in the sandbox, not in prose

Do not eyeball totals or counts from raw JSON in the conversation. Write a short Python
script (Code Mode) that:

1. Joins the failed-charge list against the customer table (Supabase) on customer ID.
2. Groups by decline code and by LTV tier.
3. Prints: total $ at risk, $ safe-to-retry, $ requiring a human decision (per the LTV
   escalation rule), and the top 5 highest-value affected customers by name.

This keeps the raw per-charge JSON out of the main context and makes sure the dollar
figures in your final report are computed, not guessed.

## 4. Decide — retry, escalate, or both

- If the evidence points to ordinary card declines **and** the decline code is in
  `safe_to_retry_decline_codes` **and** the customer is not in a `escalate_to_human_always`
  LTV tier: propose calling `retry_eligible_charges` with the batch of IDs. This call is
  gated — it will pause for a human either way. Never call it for codes in
  `never_retry_decline_codes` (stolen/lost/pickup/fraudulent) under any circumstance.
- If the evidence points to a platform-level bug: propose calling `open_recovery_ticket`
  with a root-cause summary, the linked Sentry/GitHub evidence, and the $ at risk. This is
  a job for engineering, not a retry loop — retrying against a live bug just fails again
  and burns the customer's retry budget.
- Both can apply in the same run for different segments of the same incident — segment
  first, then propose the matching action per segment.

## 5. Report

Close with a short summary a non-technical stakeholder can act on: what happened, how much
revenue is at risk, what you are proposing to do about each segment, and what you need
approved. Prefer a small table (Generative UI) over a wall of text: segment, count, $, and
proposed action.

## Guardrails

- Never call a write tool (`retry_eligible_charges`, `open_recovery_ticket`) speculatively
  "to see what happens" — only when the classification in step 2–4 supports it.
- Always state your reasoning for the batch in the `reason` argument to
  `retry_eligible_charges` — the human approving it should not have to re-derive why these
  specific IDs were selected.
- If you are not confident in the classification, say so and ask the user, rather than
  defaulting to either action.
