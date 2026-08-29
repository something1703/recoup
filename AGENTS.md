# AGENTS.md

This file is instructions for **you, the coding agent** (Claude Code, Codex, Cursor,
Windsurf, or whatever is driving this repo). Read this before touching any file. The
human running this hackathon project does not write application code themselves — that
is your job. Their job is judgment calls, credentials, and the demo. Do not wait on them
for anything this file already answers.

## What this project is

**Recoup** — an SRE for revenue. An agent, built on the TrueForge harness, that
investigates a spike in failed payments, classifies root cause across four sources,
computes exact dollar impact in executed code (never estimated in prose), and pauses for
human approval before it retries a real charge or files a real engineering ticket. Full
narrative and rationale: `README.md`. Full system design: `docs/ARCHITECTURE.md`.

## Where to start

1. Read `docs/PHASE_MAP.md` — the 10 build phases and their dependency order.
2. Open `docs/phases/01-foundations-and-repo.md` and work phases **in order**. Each phase file has its
   own prerequisites, sub-parts, exit criteria, and a note on which MCP server to use for
   that phase's work.
3. Before starting any phase, check `docs/ACCESS_CHECKLIST.md` for that phase's row. If
   an account/key isn't marked "done," **stop and ask the human for it** — do not invent
   a credential, do not skip the integration and mock it silently, do not proceed on a
   placeholder value and hope someone fills it in later. A silently-mocked integration is
   worse than a blocked phase, because it looks done and isn't.
4. `docs/MCP_TOOLKIT.md` lists every MCP server this project uses, real and currently
   published, with the exact URL/package and what job it's for. Use these, not
   hand-rolled equivalents — the entire point of building on a harness is not
   re-implementing what a maintained server already does correctly.

## Non-negotiables

- **Every change lands through a pull request, reviewed by Qodo, before it merges to
  `main`.** No direct pushes to `main`, ever, including "quick fixes." See
  `docs/CODE_QUALITY_BAR.md` for the exact workflow and what counts as a real review
  trail versus a rubber-stamp one.
- **Never fabricate a tool result, a credential, or a passing test.** If a tool call
  fails, if a service isn't connected yet, or if a test doesn't pass, say so plainly in
  your PR description and in your response to the human. Confident-sounding invented
  output is the single worst failure mode on this project — it costs the team hours
  right when there are none to spare.
- **Verify against the real, installed thing before shipping code that touches an
  external package.** Documentation (including this repo's own `docs/`) can describe a
  newer or older version than what's actually published. Before writing code against
  `@truefoundry/trueforge-ui`, `@modelcontextprotocol/sdk`, or any MCP server's tool
  schema, check the installed `.d.ts` / run the tool's `tools/list` yourself. This
  project already found two real mismatches this way (see `docs/ARCHITECTURE.md`,
  "known gotchas") — assume there are more, not fewer, ahead.
- **Money and irreversible actions are always gated.** `retry_eligible_charges` and
  `open_recovery_ticket` in `mcp-server/src/index.ts` must always resolve to
  `require_approval_for_tools` in the agent spec — annotations AND explicit tool names,
  both. If you add a new tool that writes anything (a database row, a ticket, a charge,
  an email), it needs the same treatment by default. Ask yourself "would a human be
  annoyed if this ran without being asked" — if yes, gate it.
- **`DRY_RUN=true` is the default everywhere and stays that way** except for the one
  take that gets recorded, and only against test-mode/scratch credentials. Never point
  any part of this project at a real production Stripe account, a real customer list, or
  a real team's live Linear workspace.
- **Don't touch `main` protection rules, don't disable Qodo, don't remove `DRY_RUN`
  guards** to "move faster." If a non-negotiable above is genuinely blocking progress,
  say so to the human directly — don't quietly route around it.

## Code quality bar

Full detail in `docs/CODE_QUALITY_BAR.md`. The short version: this needs to read like
software a stranger could clone and understand, because a judge will try to. TypeScript
strict mode everywhere, no `any` without a comment explaining why, every MCP tool
annotated correctly (see the gotcha above), every non-trivial function has a one-line
comment on *why*, not *what*. Run the project's lint/typecheck/test commands before
opening a PR — if they don't exist yet for a piece you're building, that's part of the
phase, not optional cleanup for later.

## MCP-first, always

If a phase's job matches something a real, maintained MCP server already does — deploying
to Cloud Run, managing GitHub, querying Supabase, reading Stripe/Sentry/Linear — use that
server. Do not write a bespoke script or hand-roll an API client for something
`docs/MCP_TOOLKIT.md` already lists a server for. The one exception is the project's own
`mcp-server/` (`recoup-actions`) — that one is intentionally custom, because it exposes
narrow, batch-shaped, approval-gated actions that no generic server should expose broadly.
If you think you need a new external MCP server this project doesn't already list, check
`docs/MCP_TOOLKIT.md`'s "how to evaluate a new one" section before adding it — and ask the
human for the account/key, don't assume you have access.

## UI work

Full spec in `docs/UI_UX_SPEC.md`. Landing page and the `cockpit/` app are two different
design problems with two different animation budgets — read the spec before writing any
component; it explains which library is for which surface and why (short version: theatrics
on the landing page, restraint on the dashboard).

## When something is ambiguous

Pick the most reasonable interpretation, state the assumption in your PR description in
one line, and proceed. Only stop and ask the human when: (a) it requires a credential you
don't have, (b) it's a genuine product/brand judgment call (naming, color, what the
skill's policy should say), or (c) proceeding could touch real money, a real external
person, or a real production system. Everything else — keep moving.

## Reporting back

At the end of any phase, or any time you get stuck, report in this shape: what's done,
what's verified (and how — a passing test, an actual tool call, a real build, not "should
work"), what's blocked and on what exactly, and what you need from the human to unblock
it. This project is on a hard deadline; a precise "blocked on X, need Y" is worth more
than an optimistic "almost there."
