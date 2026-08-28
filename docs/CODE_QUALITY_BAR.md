# Code quality bar

"Elite" isn't a vibe — it's the following, checked every PR.

## The Qodo workflow, exactly

1. Branch off `main`. Never commit directly to `main` — protect the branch in GitHub
   settings on day one so this isn't optional.
2. Open a PR as soon as there's something reviewable, even a small one. Small, frequent
   PRs give Qodo (and judges reading the trail later) a real history, not one giant diff
   the night before submission.
3. Qodo reviews automatically. Read every finding.
4. **Every genuine High-severity finding gets fixed before merge.** If a High finding is
   wrong, already handled elsewhere, or a deliberate tradeoff, dismiss it *in the Qodo
   thread* with a one-sentence reason — don't just merge past it silently. Medium/Low are
   engineering judgment; use it, but don't dismiss everything by default either.
5. Push the fix, let Qodo re-review, confirm the follow-up review is clean or the
   remaining items are consciously accepted.
6. A human merges. Not the agent — a person looks at the diff and the review thread one
   more time.
7. Update `README.md`'s Qodo Code Review Evidence section with the link the first time
   this happens on a PR that contains real hackathon code, and keep it pointed at a
   representative one, not the first trivial commit.

## What "elite" means in the code itself

- **TypeScript strict mode**, everywhere, no exceptions. `any` requires a comment
  explaining why it's genuinely unavoidable, not laziness.
- **Every MCP tool this project defines is correctly annotated** (`readOnlyHint`,
  `destructiveHint`) and, for anything that writes, named explicitly in
  `require_approval_for_tools` — this is checked in `docs/phases/08-approval-safety-layer.md`'s exit
  criteria, but it's a code-quality issue, not just a safety one: an incorrectly annotated
  tool is a bug.
- **Functions get a one-line comment on *why*, not *what*.** `// retry only safe decline
  codes — see dunning-playbook step 4` is useful; `// loop over charges` is noise.
- **No dead code, no commented-out blocks, no TODO without an issue or a phase reference.**
  If something's genuinely deferred, say which phase picks it up.
- **Errors are handled, not swallowed.** A `catch` that only logs and continues needs a
  reason in a comment for why continuing is safe there.
- **Secrets never appear in code, agent instructions, or committed `.env` files.** They
  live in `.env.example` (placeholders only), Secret Manager, and TrueForge connector
  configs.
- **Every non-trivial script is runnable by someone who wasn't there when it was written**
  — this repo's own `mcp-server/README.md`-equivalent (the setup section of the root
  `README.md`) is the test: if the steps there don't actually produce a working system on
  a clean checkout, the phase isn't done.

## Before opening any PR

Run whatever this piece of the project's lint/typecheck/test commands are (see the
relevant phase file — `mcp-server/` and `cockpit/` both already have `npm run build`
wired up and verified). If a piece doesn't have these yet, adding them is part of finishing
the phase, not a follow-up task. A PR that doesn't build is not ready for Qodo, let alone a
human.

## The judge's-eye test

Before Phase 10 wraps, have someone clone the repo fresh — a different machine if
possible — and follow `README.md` with no other context. If they get stuck, that's the bug
to fix, not a note to leave for later.
