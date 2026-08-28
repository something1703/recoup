# Phase 3: Data layer

## Objective

Stand up the business-data store — the customer/LTV table the agent joins Stripe failures
against — separate from TrueForge's own operational database.

## Prerequisites

- Phase 2 complete (a GCP project and general infra pattern established, though this
  phase's actual resource is a Supabase project, not GCP).
- Access: Supabase account — see `docs/ACCESS_CHECKLIST.md` → "Before Phase 3."

## Sub-parts

### 3.1 Project setup
- [ ] Create a new, scratch Supabase project — not one with any real data anywhere in it.
- [ ] Create a `customers` table: `id` (text, matches a real seeded Stripe customer ID),
      `name`, `plan`, `mrr_usd`, `ltv_tier` (`low`/`medium`/`high`), `signup_date`.
- [ ] Create a Postgres role scoped read-only against this table, and use that role's
      credentials wherever the Supabase MCP connector authenticates in Phase 4 — the
      harness-level `@read-only` restriction should have a real database-level backstop.

### 3.2 Seed data
- [ ] Adapt `scripts/seed-stripe-test-data.ts` (already in this repo) to print customer
      rows using the *real* Stripe customer IDs it generates, then insert those into this
      table — see `scripts/seed-supabase.sql`'s existing note on why the IDs must match
      exactly.
- [ ] Follow `docs/DEMO_SCRIPT.md`'s data-realism section while writing the fixture list:
      realistic name/MRR distribution, decline-code proportions that mirror real dunning
      data.

## MCP to use

None needed for this phase specifically — table creation and seeding are direct
Supabase SQL editor / script work. The Supabase **MCP server** comes into play in Phase 4
when the *agent* queries this table at runtime.

## Exit criteria

- [ ] The `customers` table exists in a scratch Supabase project, seeded with realistic
      fixture data whose IDs match the Stripe test customers from Phase 4's seed run.
- [ ] A read-only role exists and is the one that gets used for the connector, not an
      admin/service-role key.
