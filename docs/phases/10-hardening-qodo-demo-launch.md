# Phase 10: Hardening, Qodo, demo & launch

## Objective

Turn a working system into a submission a judge can run, watch, and believe in three
minutes. This is the last phase — nothing here should surface a feature gap for the first
time; it should only surface polish and confidence issues.

## Prerequisites

- Phases 1–9 complete.
- Access: confirm everyone's Qodo notifications work — see `docs/ACCESS_CHECKLIST.md` →
  "Before Phase 10."

## Sub-parts

### 10.1 Full QA pass
- [ ] Run the whole flow start to finish, 3–5 times back to back. Fix whatever breaks.
- [ ] Use **Playwright MCP** to script a repeatable check of the cockpit's critical path
      (investigation → report → approval card renders → Allow works) so this isn't only
      ever tested by eyeballing it.

### 10.2 The reconnect, model-swap, and skill-swap beats
- [ ] Confirm the mid-run browser-refresh beat is smooth (`docs/DEMO_SCRIPT.md`).
- [ ] Confirm the OpenAI ↔ Gemini model swap works and re-runs cleanly.
- [ ] Confirm the dunning-playbook ↔ refund-abuse-playbook skill swap (Phase 6.6) runs
      cleanly on the same agent, tools, and cockpit — this is the "pattern, not a
      payments bot" claim, proven on camera rather than only asserted in the README.

### 10.3 Final Qodo + README pass
- [ ] Every PR containing real hackathon code has gone through the full Qodo workflow in
      `docs/CODE_QUALITY_BAR.md` — initial review, real fixes or stated dismissals, a
      follow-up review, human merge.
- [ ] `README.md`'s Qodo Code Review Evidence section links to a real, representative
      merged PR.
- [ ] Clone the repo fresh (a different machine if possible) and follow `README.md` with
      no other context — fix anything that doesn't work exactly as written.

### 10.4 Record
- [ ] Rehearse the beat sheet in `docs/DEMO_SCRIPT.md` until it's tight.
- [ ] Record the take. Record a backup take.
- [ ] Freeze the seed data before recording — no re-seeding between rehearsal and the
      final take.

### 10.5 Submit
- [ ] Public repo, working README, demo video linked, submission form filled out with
      margin before the deadline — not at the wire.
- [ ] If pursuing the blog-post or social-post tracks, do them now, not after submitting
      — reference the Phase 7.4 eval harness results (a scored per-model comparison) as
      the citable hook rather than a prose "it worked."

## MCP to use

**Playwright MCP** for 10.1's automated pass. **GitHub MCP** for confirming the final PR
history looks right. No new servers introduced this phase — this is verification and
polish on everything already built.

## Exit criteria

- [ ] A stranger (or a fresh clone) can run this end to end from `README.md` alone.
- [ ] The demo video exists, is under the beat sheet's target length, and has a recorded
      backup.
- [ ] The submission is in, with time to spare.
