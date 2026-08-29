# Phase 2: Harness & cloud infrastructure

## Objective

Get TrueForge running in hosted mode on GCP, with its supporting infra, before connecting
any models or tools. Nothing in later phases works without this existing first.

## Prerequisites

- Phase 1 complete.
- Access: GCP project + billing, Upstash account, Gemini Developer API key, OpenAI API
  key — see `docs/ACCESS_CHECKLIST.md` → "Before Phase 2."

## Sub-parts

### 2.1 Data + cache endpoints
- [ ] Provision the Postgres that will back TrueForge's own hosted-mode state (sessions,
      turns, agent library). This is a **separate** database from the Supabase project in
      Phase 3 — see `docs/ARCHITECTURE.md`'s note on why.
- [ ] Provision the Upstash Redis database for cross-replica peering.
- [ ] Store both connection strings in Secret Manager, not in any file that gets committed.

### 2.2 Deploy TrueForge to Cloud Run
- [ ] Build/deploy the TrueForge server (hosted mode) to Cloud Run. **TrueForge does not
      read a single `DATABASE_URL`** — verified against `packages/trueforge/.env.example`
      in the TrueForge source — it takes discrete `POSTGRES_USER`, `POSTGRES_PASSWORD`,
      `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`. Split whatever connection string
      the Postgres provider gives you into those five vars. `REDIS_URL` (a single
      connection string) and `PUBLIC_BASE_URL` (the Cloud Run service URL, needed for MCP
      OAuth callbacks) are both real, correct as single vars. Wire all of it from Secret
      Manager, set `STANDALONE=false`.
- [ ] Confirm the service is reachable and the UI loads at its Cloud Run URL.
- [ ] Decide replica strategy: pinning to a single instance reduces (but doesn't officially
      eliminate the need for) Redis; the documented, supported path is Postgres + Redis
      regardless of replica count — don't try to prove the undocumented shortcut under
      deadline pressure.

### 2.3 Models
- [ ] Add the OpenAI provider in Settings → Models.
- [ ] Add the Gemini provider using the Gemini Developer API key (see
      `docs/ARCHITECTURE.md` gotcha #2 — this is not raw Vertex OAuth).
- [ ] Add at least one model from each as a configured model, so Phase 6's model-swap demo
      beat has two real options.

### 2.4 CI/CD
- [ ] Set up Cloud Build triggered on merge to `main`, deploying to the Cloud Run service
      from 2.2 (and, once it exists, the `recoup-actions` service from Phase 5).
- [ ] Confirm one real merge actually triggers one real deploy before relying on this later.

## MCP to use

**Google Cloud Run MCP** (official, `GoogleCloudPlatform/cloud-run-mcp`) for the actual
deploys in 2.2 and the CI/CD wiring in 2.4 — let the coding agent drive `gcloud`-equivalent
operations through this rather than the human hand-running commands. See
`docs/MCP_TOOLKIT.md` for the two connection modes.

## Exit criteria

- [ ] TrueForge is reachable at a public Cloud Run URL, backed by Postgres + Redis, with
      OpenAI and Gemini both configured and at least one model each selectable.
- [ ] A real git merge produces a real redeploy, confirmed once.
