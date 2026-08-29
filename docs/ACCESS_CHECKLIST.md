# Access checklist

For the human, not the agent. The agent cannot create accounts or accept ToS on your
behalf — it will stop and ask for each of these when its phase needs it. Getting these
early prevents mid-build stalls. None of these need a paid tier.

Mark each `[ ]` → `[x]` as you do it, and drop the resulting key/URL wherever your team
keeps shared secrets (not committed to the repo — `mcp-server/.env` and Cloud Run's Secret
Manager are the only places any of these should live).

## Before Phase 1

- [ ] **GitHub** — the repo itself, and a Personal Access Token with repo scope (for the
      GitHub MCP server and for the GitHub catalog connector in Phase 4).
- [ ] **Qodo** — sign in with the GitHub account that has admin on the repo, then
      Integrations → SaaS → GitHub → Add installation, authorize this repo. Free 14-day
      trial, no card. One person on the team doing this covers everyone.

## Before Phase 2

- [ ] **GCP project** — with billing enabled (Cloud Run, Cloud Build, and Secret Manager
      all need it; free-tier/credits cover a hackathon's usage).
- [ ] **Supabase account** — create it now and make **two projects**: one whose Postgres
      connection string backs TrueForge's own hosted-mode state (used in Phase 2), and one
      scratch project for the customers table (used in Phase 3). Free tier covers both.
      (Cloud SQL works for the first one too if you'd rather stay all-GCP — but two
      Supabase projects is the zero-extra-vendors path.)
- [ ] **Upstash account** — a free Redis database, for hosted-mode cross-replica peering.
- [ ] **A Gemini Developer API key** — generated under the *same* GCP project as above for
      billing continuity (see `docs/ARCHITECTURE.md` gotcha #2 — this is not the same
      thing as generic "Vertex AI access").
- [ ] **An OpenAI API key.**

## Before Phase 3

- [ ] Nothing new — the scratch Supabase project was created in the Phase 2 step above.

## Before Phase 4

- [ ] **Stripe account** — test mode only. If your team already has one for something
      else, that's fine, as long as everything this project does stays in test mode.
- [ ] **Sentry account** — a new scratch project.
- [ ] **Linear account** — a new scratch team/workspace.

## Before Phase 5

- [ ] Nothing new — Phase 5 reuses the Stripe/Linear credentials above, plus the GCP
      project from Phase 2.

## Before Phase 6

- [ ] **A Daytona account and API key** — free tier. Missed in the original checklist:
      skills and Code Mode both require a configured sandbox provider before an agent
      referencing either can even be created (`PUT /settings/sandbox-providers`), not
      just before Phase 7's orchestration work — found this the hard way trying to
      create the `recoup` agent itself.

## Before Phase 9

- [ ] **A domain or subdomain** (optional) — if you want the cockpit and the TrueForge
      instance on real URLs instead of default `*.run.app` / Firebase Hosting URLs for the
      demo video. Not required.
- [ ] **Claude.ai access with Claude Design** (optional) — for the first visual-direction
      pass before any component gets built for real.

## Before Phase 10

- [ ] Confirm everyone who needs to approve/merge a PR has Qodo's review visible on their
      GitHub notifications — don't discover someone can't see the review thread the night
      before submission.

## What never goes in this checklist

Anything that would touch real customer data, a production Stripe account, or a real
team's live workspace. If a phase file asks for something that sounds like it needs real
production access, that's a bug in the phase file — flag it, don't provide it.
