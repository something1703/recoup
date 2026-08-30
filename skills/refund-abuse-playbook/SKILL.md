---
name: refund-abuse-playbook
description: How to investigate a spike in refunds, separate serial refund abuse from a product failure that caused a legitimate refund wave, quantify the revenue impact, and route each segment to a human-reviewed ticket. Use whenever asked to look into refunds, refund rate spikes, refund abuse, or chargeback-adjacent behavior.
---

# Refund-Abuse & Refund-Wave Playbook

You are investigating a refund incident the way an SRE investigates an uptime incident —
except the metric is refunded revenue, not latency. This is the same five-stage discipline
as the dunning-playbook, pointed at a different leak: work the stages in order, never act
before classifying. A refund wave caused by OUR bug and a serial refund abuser look the
same in a top-line refund rate — treating one as the other either punishes an innocent
customer or files a useless engineering ticket.

Recoup runs this playbook for multiple tenant companies — every tool call below takes a
`company_id`. Confirm which tenant you're investigating before calling anything.

## 1. Triage — pull the raw picture

- Pull recent refunds from Stripe (date range, amounts, customer IDs, refund reasons,
  and the age of each charge when it was refunded). Note total count and total $.
- Compare against the trailing baseline — "refund rate tripled this week" is the number
  that opens the final report.

## 2. Classify — abuse vs. product failure

Delegate this stage to parallel sub-agents, one per evidence source, and merge their
findings rather than working serially:

1. **Stripe refund-pattern sizer** — group refunds by customer. Flag customers with
   repeated refunds, refunds issued shortly after long usage periods, or a high
   refund-to-purchase ratio. Spread-out, first-time, prompt refunds look ordinary.
2. **Customer value tiering** — call `get_customer_ltv` with the affected customer IDs.
   A high-LTV customer suddenly refunding is a churn signal worth human eyes regardless
   of classification; a low-LTV account with serial refunds fits an abuse pattern.
3. **Sentry error correlation** — search for an error spike (double-charge, broken
   entitlement, failed provisioning) whose first-seen lines up with the refund wave.
4. **GitHub deploy correlation** — check for a release touching billing/checkout/
   entitlement code in the same window.

Read the summaries together:

- **Abuse signal**: refunds concentrated in a few repeat customers, timed to extract
  maximum use before refunding, with *no* matching Sentry/GitHub signal.
- **Product-failure signal**: refunds spread across many unrelated customers, clustered
  tightly after a deploy Sub-agent 4 found or an error Sub-agent 3 found. That is OUR
  bug driving legitimate refunds — an engineering problem, not a customer problem.

If Sentry or GitHub aren't connected, say so explicitly and proceed on the Stripe +
LTV evidence alone rather than guessing.

## 3. Quantify — do the math in the sandbox, not in prose

Write a short Python script (Code Mode) that:

1. Joins the refund list against the `get_customer_ltv` results on customer ID.
2. Groups by suspected-abuse vs. product-failure segments, and by LTV tier.
3. Prints: total $ refunded, $ attributed to each segment, repeat-refund counts per
   flagged customer, and the top 5 affected customers by name.

Computed figures only — never eyeball totals from raw JSON in conversation.

## 4. Decide — both paths end at a human, always

- **Suspected serial abuse**: propose `open_recovery_ticket` with a trust-and-safety
  review request: the flagged customers, their refund history, computed $ impact, and
  the evidence for the pattern. NEVER propose blocking, denying a refund, or contacting
  the customer — a false abuse accusation costs more than the refunds; a human reviews
  every flag.
- **Product-failure wave**: propose `open_recovery_ticket` as an engineering bug ticket
  with the linked Sentry/GitHub evidence and $ impact — fixing the bug stops the wave;
  the refunds themselves were legitimate and stay untouched.
- Both can apply in the same run for different segments — segment first, then file the
  matching ticket per segment.
- `retry_eligible_charges` is never applicable in this playbook. Do not call it.

## 5. Report

Close with a summary a non-technical stakeholder can act on: what happened, how much
refund revenue is affected, the segments and evidence, and what you need approved.
Prefer a small table (Generative UI): segment, count, $, proposed action.

## Guardrails

- Never call a write tool speculatively — only when stage 2's classification supports it.
- Never take, or propose, any action against a customer directly. Every abuse flag is a
  human-reviewed ticket, nothing more.
- If you are not confident in the classification, say so and ask, rather than defaulting
  to either ticket.
