-- Multi-tenant migration: Recoup moves from "one fictional SaaS company's
-- customers" to a platform that runs revenue recovery FOR multiple client
-- companies — matching the real product shape (an SRE-for-revenue platform
-- has many customers, the same way Datadog/PagerDuty do), and giving the
-- account-health desk a REAL population with REAL recorded outcomes to be
-- judged against, instead of a hand-picked fixture set.
--
-- Run once against the recoup-wemakedevs scratch Supabase project (same
-- project as seed-supabase.sql), after that file. Idempotent: every
-- statement is IF NOT EXISTS / ON CONFLICT DO NOTHING / guarded, so re-running
-- after a partial failure is safe.

-- ---------------------------------------------------------------------------
-- 1. companies — the tenants Recoup runs revenue recovery for.
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id text primary key,
  name text not null,
  industry text not null,
  created_at date not null default current_date
);

insert into public.companies (id, name, industry) values
  ('comp_arcline_software', 'Arcline Software', 'b2b_saas'),
  ('comp_ferro_commerce', 'Ferro Commerce', 'subscription_retail'),
  ('comp_meridian_telecom', 'Meridian Telecom', 'consumer_telecom')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. customers — tenant-scope the existing fixtures, add columns the real
--    Telco Customer Churn import needs (Meridian's business doesn't have
--    "seats" or "API quota" — it has contract/payment-method/tenure, so this
--    is a genuinely different signal set, not a renamed copy of product_usage).
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists company_id text references public.companies(id);

-- Backfill: every row seeded before this migration belongs to one of the two
-- original fixture tenants (seed-stripe-test-data.ts -> Arcline,
-- seed-refund-test-data.ts -> Ferro). Frozen per docs/DEMO_SCRIPT.md — this
-- assigns tenancy without touching the rows themselves.
update public.customers set company_id = 'comp_arcline_software'
  where company_id is null and id in (
    'cus_VA05dGTREwelwC', 'cus_VA05hRYXWOI1By', 'cus_VA05uGoXTHlg6h', 'cus_VA05o7Y2w3fnco',
    'cus_VA050V3RKMfJ0s', 'cus_VA0522HvpyRtiK', 'cus_VA05lBVZ9gFxoy', 'cus_VA05qiFPX9VPgO'
  );
update public.customers set company_id = 'comp_ferro_commerce'
  where company_id is null and id in ('cus_VADMoGziwOA758', 'cus_VADMs4pyo5HsfO', 'cus_VADMZ09cI8WWKv');

-- Fail loudly instead of letting SET NOT NULL below throw a bare constraint
-- error: the backfill above only covers the 11 known fixture IDs, so any
-- OTHER pre-existing customer row (a manual insert, a regenerated fixture
-- with new Stripe IDs) would otherwise silently block this migration with no
-- indication of which row or what to do about it.
do $$
begin
  if exists (select 1 from public.customers where company_id is null) then
    raise exception 'customers.company_id is null for % row(s) not covered by this migration''s backfill — assign them a company_id manually before rerunning',
      (select count(*) from public.customers where company_id is null);
  end if;
end $$;

-- Enforced only after backfill so this migration is safe to run against a
-- database that already has the pre-tenancy fixture rows in it.
alter table public.customers alter column company_id set not null;

-- Real Telco Customer Churn columns (nullable — only populated for
-- comp_meridian_telecom rows; Arcline/Ferro rows leave these null, the same
-- way Meridian rows will never have a product_usage row).
alter table public.customers add column if not exists tenure_months int;
alter table public.customers add column if not exists contract_type text;
alter table public.customers add column if not exists payment_method text;
alter table public.customers add column if not exists total_charges_usd numeric;

-- ---------------------------------------------------------------------------
-- 3. dunning_policy — rebuilt per-tenant. The old singleton's thresholds
--    (high >= $500 MRR) were derived from Arcline's SaaS pricing and are
--    silently wrong for Meridian: real MonthlyCharges in the Telco dataset
--    top out at $118.75 (p95 = $107.40, verified against the actual CSV,
--    2026-08-30) — under the old thresholds NO Meridian customer would ever
--    reach "high" tier, meaning the mandatory-human-escalation safety net
--    would never fire for this tenant's highest-value accounts. Thresholds
--    below are grounded in that same real percentile distribution, not
--    invented: high starts at Meridian's real p90, medium at roughly its
--    real median.
-- ---------------------------------------------------------------------------
-- This DROP is only safe to run ONCE, against the pre-multi-tenant singleton
-- shape (primary key `id boolean`) — Postgres does not carry a table's rows
-- forward across DROP+CREATE, so re-running this against an already-migrated
-- database (company_id already the primary key) would silently destroy any
-- tenant-specific tuning made since. Refuse instead of guessing.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dunning_policy' and column_name = 'company_id'
  ) then
    raise exception 'dunning_policy already has a company_id column — this migration has already run. ' ||
      'Re-running would DROP and destroy any tenant policy tuning made since. Edit rows directly instead.';
  end if;
end $$;

drop table if exists public.dunning_policy;
create table public.dunning_policy (
  company_id text primary key references public.companies(id),
  max_auto_retry_attempts int not null,
  never_retry_decline_codes text[] not null,
  safe_to_retry_decline_codes text[] not null,
  retry_backoff_hours int[] not null,
  ltv_tiers jsonb not null,
  updated_at date not null default current_date
);

insert into public.dunning_policy (company_id, max_auto_retry_attempts, never_retry_decline_codes, safe_to_retry_decline_codes, retry_backoff_hours, ltv_tiers) values
  ('comp_arcline_software', 2,
    array['stolen_card', 'lost_card', 'pickup_card', 'fraudulent'],
    array['insufficient_funds', 'do_not_honor', 'processing_error', 'try_again_later'],
    array[24, 72],
    '{"high": {"min_mrr_usd": 500, "escalate_to_human_always": true}, "medium": {"min_mrr_usd": 100}, "low": {"min_mrr_usd": 0}}'::jsonb),
  ('comp_ferro_commerce', 2,
    array['stolen_card', 'lost_card', 'pickup_card', 'fraudulent'],
    array['insufficient_funds', 'do_not_honor', 'processing_error', 'try_again_later'],
    array[24, 72],
    '{"high": {"min_mrr_usd": 200, "escalate_to_human_always": true}, "medium": {"min_mrr_usd": 60}, "low": {"min_mrr_usd": 0}}'::jsonb),
  ('comp_meridian_telecom', 2,
    array['stolen_card', 'lost_card', 'pickup_card', 'fraudulent'],
    array['insufficient_funds', 'do_not_honor', 'processing_error', 'try_again_later'],
    array[24, 72],
    '{"high": {"min_mrr_usd": 95, "escalate_to_human_always": true}, "medium": {"min_mrr_usd": 55}, "low": {"min_mrr_usd": 0}}'::jsonb);

-- ---------------------------------------------------------------------------
-- 4. recovery_ledger — tenant-scope so /stats can be reported per company.
--    Backfilled to Arcline: every ledger row written so far came from the
--    Phase 6.3 live investigation run against the Arcline fixture customers
--    (the only tenant that existed at the time).
-- ---------------------------------------------------------------------------
alter table public.recovery_ledger add column if not exists company_id text references public.companies(id);
update public.recovery_ledger set company_id = 'comp_arcline_software' where company_id is null;

-- ---------------------------------------------------------------------------
-- 5. customer_churn_ground_truth — the real, held-out outcome label from the
--    IBM Telco Customer Churn dataset. This must NEVER be reachable by the
--    agent (via recoup_agent_readonly) or by recoup-actions' own tool logic
--    (recoup_actions_service) — it exists ONLY for scripts/score-account-
--    health-eval.ts to check the agent's account-health classifications
--    against a real recorded outcome after the fact. No grant below gives
--    either agent-facing role access to this table — that omission is the
--    control, not an oversight.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_churn_ground_truth (
  customer_id text primary key references public.customers(id),
  churned boolean not null,
  source text not null default 'ibm_telco_customer_churn_dataset',
  imported_at date not null default current_date
);

-- ---------------------------------------------------------------------------
-- 6. Roles — extend the two existing roles to the new tables, and add a
--    THIRD role that can read the held-out ground truth. This role is never
--    wired into mcp-server or any TrueForge connector — it exists only for
--    a human/script to run scripts/score-account-health-eval.ts.
-- ---------------------------------------------------------------------------
grant select on public.companies to recoup_agent_readonly;
grant select on public.companies to recoup_actions_service;
grant select on public.dunning_policy to recoup_agent_readonly;
-- dunning_policy was DROP+CREATE'd above (not ALTER'd) — Postgres does not
-- carry grants forward across a drop/recreate, so this must be re-issued even
-- though the old singleton table already had it. Missed on the first run of
-- this migration (2026-08-30) and caught only by querying live grants
-- afterward rather than assuming the old grant survived — it hadn't, and
-- retry_eligible_charges' independent policy check would have failed at
-- runtime with a permission error the first time it ran for real.
grant select on public.dunning_policy to recoup_actions_service;

-- Supabase grants anon/authenticated (its public PostgREST roles) full CRUD
-- on every new table by default — verified live and revoked here. Without
-- this, customer_churn_ground_truth (created below) would be readable by
-- anyone with this project's public anon key, defeating the entire point of
-- holding it out from the agent.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'recoup_eval_scorer') then
    create role recoup_eval_scorer login password '<SET-A-REAL-RANDOM-PASSWORD>';
  end if;
end $$;
grant usage on schema public to recoup_eval_scorer;
grant select on public.customer_churn_ground_truth to recoup_eval_scorer;
grant select on public.customers to recoup_eval_scorer;
