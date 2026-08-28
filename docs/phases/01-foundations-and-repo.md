# Phase 1: Foundations — repo, Qodo, operating contract

## Objective

Get the repo, its protection rules, and the Qodo review loop running before a single line
of real feature code exists. This phase is short and almost entirely non-negotiable
process — do not skip or reorder any part of it to "get to the real work faster."

## Prerequisites

- Access: GitHub repo + PAT, Qodo sign-in — see `docs/ACCESS_CHECKLIST.md` → "Before
  Phase 1."

## Sub-parts

### 1.1 Repo setup
- [ ] Create the GitHub repo (public, per the hackathon rules).
- [ ] Add `AGENTS.md`, `README.md`, `.gitignore` (Node, Python if used, `.env`) as the
      first commit — but through a PR, not a direct push (see 1.3).
- [ ] Protect `main`: require a PR before merge, require the Qodo check (once it exists)
      to pass or be explicitly acknowledged.

### 1.2 Qodo
- [ ] One teammate with admin on the repo signs into Qodo.
- [ ] Integrations → SaaS → GitHub → Add installation → authorize this repo.
- [ ] Confirm: opening a PR triggers a Qodo review automatically. If it doesn't, comment
      `/agentic_review` on the PR.

### 1.3 The first PR — seed the review trail
- [ ] Branch, add the initial files from 1.1, open a PR.
- [ ] Let Qodo review it, even though it's small. This is the first entry in the review
      trail the hackathon's Q Branch track and general submission rules require.
- [ ] Merge only after the review has actually run once — don't merge in the gap before
      it fires.

### 1.4 Team operating rhythm (skip if solo)
- [ ] Agree on branch naming, PR size expectations ("small and frequent," per
      `docs/CODE_QUALITY_BAR.md`), and who has merge rights.
- [ ] Point everyone at `docs/PHASE_MAP.md` for who's doing what if working in parallel.

### 1.5 CI on every PR
- [ ] Add a GitHub Actions workflow that runs `npm run build` for both `mcp-server/`
      and `cockpit/` (and the test suite once Phase 5.7 adds one) on every PR. Qodo
      reviews the diff for quality; CI proves it actually builds — judges reading the
      PR trail should see a green check next to the review, not just the review.

## MCP to use

**GitHub MCP** (official, `https://api.githubcopilot.com/mcp/`) for repo/branch/PR
operations if your coding agent supports remote MCP servers — see `docs/MCP_TOOLKIT.md`.
Otherwise, standard `git`/`gh` CLI is fine for this phase; the MCP server starts earning
its keep once there's a real correlation subagent reading GitHub in Phase 7.

## Exit criteria

- [ ] Repo exists, `main` is protected, first PR is merged with a real (even if trivial)
      Qodo review visible on it.
- [ ] `docs/ACCESS_CHECKLIST.md`'s "Before Phase 1" section is fully checked off.
- [ ] CI is green on the PR trail from the point real application code exists.
