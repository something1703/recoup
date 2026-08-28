# Demo script

## The 3-minute beat sheet

| Time | Beat | What it proves |
|---|---|---|
| 0:00–0:15 | Cold open, in the **cockpit**: a dashboard shows "40 failed charges today vs. an average of 9." Ask Recoup to investigate. | The stakes, presentation |
| 0:15–0:55 | Agent steps panel expands: four sub-agent threads spin up (Stripe / Supabase / Sentry / GitHub). Narrate what Code Mode is doing in one sentence — don't over-explain. | Technical excellence, use of sponsor tools |
| 0:55–1:15 | Generative UI table lands: segment, count, $, proposed action. State the total $ at risk out loud. | Presentation |
| 1:15–1:45 | The bespoke gold-bordered approval card appears for `retry_eligible_charges`. Pause. Let the viewer read the batch. Click **Allow**. Don't rush this. | **Control and safety**, presentation |
| 1:45–2:05 | Second path: `open_recovery_ticket` fires for the flagged segment — its own card, approve it. Show the created Linear issue. | Creativity (two-path branching), control and safety |
| 2:05–2:25 | Refresh the browser tab mid-narration on a fresh run; session picks back up untouched, cockpit and all. | Technical excellence |
| 2:25–2:50 | Swap the model selector (OpenAI ↔ Gemini) and re-run in a few seconds. | Technical excellence |
| 2:50–3:00 | Closing card: dollar amount recovered, one line on what TrueForge did for you that you didn't have to build. | Impact, presentation |

Cut anything that doesn't fit — a tight 2:40 beats a rushed 3:10.

## Why synthetic data won't sink this, if handled right

Every fintech hackathon demo runs on test-mode data — no judge expects otherwise, and
showing anything else would be the actual red flag. What matters:

1. **Say it once, plainly, early** — "this is Stripe test mode" — then move on. Owning it
   kills the concern in one sentence; dancing around it is what makes a demo feel fake.
2. **Make the shape realistic, not just the quantity.** `insufficient_funds` should
   dominate the seeded set (it does in real dunning data), `stolen_card` should be the rare
   one-off, MRR figures shouldn't be round numbers.
3. **You cannot backdate Stripe timestamps.** Don't try to fake a 30-day trend chart from
   live API data. The baseline ("9 failures/day normally") is a stated config value in
   `get_dunning_thresholds`, not a chart — the agent cites a real number your own system
   owns.
4. **Code Mode already hides the raw volume.** A dozen seeded records never need to appear
   verbatim — the agent shows a 4-row segment table. This is the actual reason Code Mode
   matters for the demo specifically, not just for the math.
5. **Let everything downstream of the seed data be completely real** — the real repo, a
   real (if scratch) Linear workspace that really gets a ticket filed, a real Sentry
   project, a real Cloud Run URL. Only the transaction premise is synthetic; every system
   reacting to it does real work.
6. **Freeze the seed data after the last rehearsal.** `scripts/seed-stripe-test-data.ts`
   uses a fixed fixture list, not randomized generation — don't regenerate it right before
   recording, or a rehearsed line ("Fathom Insurance, our highest-LTV account...") might no
   longer match.
7. **Record a backup take.** OAuth tokens expire, APIs hiccup. Never let a live failure in
   front of judges be the only version that exists.
