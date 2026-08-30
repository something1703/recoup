-- Schema + seed template for the Recoup demo. Run in the Supabase SQL editor of a
-- SECOND, separate scratch project (never the same project backing TrueForge's own
-- hosted-mode state, and never a real production project) before connecting the
-- Supabase MCP.
--
-- Two different consumers read/write this data, with two different roles below:
--   1. The agent, via TrueForge's Supabase MCP connector (Phase 4) — broad
--      investigative reads, restricted to @read-only at the harness level and
--      backed by a real read-only role here.
--   2. The `recoup-actions` MCP server itself, via a direct Postgres connection
--      (Phase 5.5/5.6) — a narrow, specific lookup to independently verify decline
--      code / LTV tier before retrying, and to write the recovery ledger. This is
--      not a duplicate of #1 for the same reason: the agent must not be the only
--      thing standing between a bad classification and a real charge.

-- ---------------------------------------------------------------------------
-- 0. companies — the tenants Recoup runs revenue recovery for. Every other
--    table below is scoped to one of these — Recoup is a platform serving
--    multiple client businesses, not a single company's internal tool.
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
-- 1. customers — the agent joins Stripe failures against this for LTV tiering.
--    tenure_months/contract_type/payment_method/total_charges_usd are only
--    populated for comp_meridian_telecom (see scripts/import-telco-population.ts)
--    — a real dataset's real subscriber attributes, not a renamed copy of
--    product_usage's SaaS-shaped seat/API columns below. Different tenants'
--    businesses genuinely expose different signals; get_account_usage returns
--    whichever apply and nulls the rest.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id text primary key,              -- a real Stripe customer ID (e.g. 'cus_Qi93x...') for Arcline/Ferro, or 'merid_<real dataset ID>' for Meridian
  name text not null,
  plan text not null,               -- 'starter' | 'growth' | 'enterprise' for Arcline/Ferro; contract type (e.g. 'month_to_month') for Meridian
  mrr_usd numeric not null,
  ltv_tier text not null,           -- 'low' | 'medium' | 'high' — mirror of dunning_policy.ltv_tiers, thresholds are per-company
  signup_date date not null,
  company_id text not null references public.companies(id),
  tenure_months int,
  contract_type text,
  payment_method text,
  total_charges_usd numeric
);

-- Real Stripe TEST-mode customer IDs, printed by scripts/seed-stripe-test-data.ts
-- against the project's Stripe test-mode key and applied to the scratch Supabase
-- project on 2026-08-29. Re-run the seed script and replace this block if the
-- Stripe test data is ever reseeded (IDs regenerate on every run).
insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date, company_id) values
  ('cus_VA05dGTREwelwC', 'Bramwell & Foss', 'enterprise', 2400, 'high', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA05hRYXWOI1By', 'Halcyon Robotics', 'growth', 620, 'high', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA05uGoXTHlg6h', 'Petal & Co', 'starter', 49, 'low', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA05o7Y2w3fnco', 'Northwind Analytics', 'growth', 340, 'medium', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA050V3RKMfJ0s', 'Kestrel Studio', 'starter', 79, 'low', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA0522HvpyRtiK', 'Fathom Insurance', 'enterprise', 3100, 'high', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA05lBVZ9gFxoy', 'Marrow Coffee Co', 'starter', 29, 'low', '2026-08-29', 'comp_arcline_software'),
  ('cus_VA05qiFPX9VPgO', 'Underline Design', 'growth', 210, 'medium', '2026-08-29', 'comp_arcline_software')
on conflict (id) do nothing;

-- Refund-abuse-playbook fixtures (scripts/seed-refund-test-data.ts), Ferro Commerce tenant.
insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date, company_id) values
  ('cus_VADMoGziwOA758', 'Vellum Papercraft', 'starter', 39, 'low', '2026-08-29', 'comp_ferro_commerce'),
  ('cus_VADMs4pyo5HsfO', 'Quarry Analytics', 'growth', 280, 'medium', '2026-08-29', 'comp_ferro_commerce'),
  ('cus_VADMZ09cI8WWKv', 'Lantern Legal', 'starter', 59, 'low', '2026-08-29', 'comp_ferro_commerce')
on conflict (id) do nothing;

-- comp_meridian_telecom's ~7,043 real customer rows come from
-- scripts/import-telco-population.ts (the real IBM Telco Customer Churn
-- dataset), not from this seed file — too large to inline, and re-running the
-- import is idempotent (ON CONFLICT DO NOTHING).

-- ---------------------------------------------------------------------------
-- 1b. product_usage — SaaS-shaped usage signals for comp_arcline_software
--     accounts only (seed-revenue-dept-data.ts). Meridian has no seats/API
--     quota — its usage signal is customers.tenure_months/contract_type/
--     payment_method/total_charges_usd above instead.
-- ---------------------------------------------------------------------------
create table if not exists public.product_usage (
  customer_id text primary key references public.customers(id),
  seats_included int not null,
  seats_used int not null,
  api_quota_30d int not null,
  api_calls_30d int not null,
  last_active_date date not null
);

-- ---------------------------------------------------------------------------
-- 1c. customer_churn_ground_truth — the real, held-out Churn outcome from the
--     Telco dataset. NEVER granted to recoup_agent_readonly or
--     recoup_actions_service — see the roles section below. Exists only so
--     scripts/score-account-health-eval.ts can check the agent's
--     account-health classifications against a real recorded outcome.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_churn_ground_truth (
  customer_id text primary key references public.customers(id),
  churned boolean not null,
  source text not null default 'ibm_telco_customer_churn_dataset',
  imported_at date not null default current_date
);

-- ---------------------------------------------------------------------------
-- 2. dunning_policy — one row PER TENANT, not a global singleton. A tenant's
--    thresholds must be grounded in that tenant's own revenue distribution:
--    comp_arcline_software's real SaaS MRR runs up to $3,100/mo, so a $500
--    "always escalate to a human" cutoff is meaningful there. comp_meridian_
--    telecom's real subscriber base (the actual Telco Customer Churn dataset)
--    tops out at $118.75/mo (p90 = $102.60, verified against the CSV) — the
--    SAME $500 cutoff would silently never fire for its highest-value
--    accounts, so its thresholds are recalibrated to its own real percentiles
--    instead. get_dunning_thresholds / retry_eligible_charges (mcp-server)
--    both read this by company_id, never a hardcoded constant.
-- ---------------------------------------------------------------------------
create table if not exists public.dunning_policy (
  company_id text primary key references public.companies(id),
  max_auto_retry_attempts int not null,
  never_retry_decline_codes text[] not null,
  safe_to_retry_decline_codes text[] not null,
  retry_backoff_hours int[] not null,
  ltv_tiers jsonb not null,          -- { high: {min_mrr_usd, escalate_to_human_always}, medium: {...}, low: {...} }
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
    '{"high": {"min_mrr_usd": 95, "escalate_to_human_always": true}, "medium": {"min_mrr_usd": 55}, "low": {"min_mrr_usd": 0}}'::jsonb)
on conflict (company_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. recovery_ledger — audit trail written by recoup-actions (Phase 5.6) after
--    every proposed batch/ticket. Source for the cockpit's cumulative "$
--    recovered" stat (Phase 9.7) — company_id lets that stat be sliced per
--    tenant, or summed across all of them (the default, no filter).
-- ---------------------------------------------------------------------------
create table if not exists public.recovery_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_type text not null check (action_type in ('retry_eligible_charges', 'open_recovery_ticket')),
  reason text not null,
  -- Always 'allow' in practice: TrueForge never calls the tool at all on Deny,
  -- so this server structurally has no path to observe or record a denial —
  -- that event lives entirely in TrueForge's own turn history.
  human_decision text not null check (human_decision in ('allow', 'deny')),
  charge_ids text[],                -- populated for retry_eligible_charges
  linear_issue_id text,             -- populated for open_recovery_ticket
  outcome jsonb not null,           -- per-charge status array, or the created issue
  company_id text references public.companies(id)
);

-- CREATE TABLE IF NOT EXISTS above does nothing for a table that already
-- existed before this column was added — this makes re-running the script
-- against an already-provisioned project self-healing instead of silently
-- leaving amount_usd missing. Recovered $ (retries) or $ at risk (tickets) —
-- cockpit's Phase 9.7 stat sums this.
alter table public.recovery_ledger add column if not exists amount_usd numeric not null default 0;
alter table public.recovery_ledger add column if not exists company_id text references public.companies(id);

-- ---------------------------------------------------------------------------
-- Roles — three. Least privilege: none can write to a table it has no
-- business writing to, and the two agent-facing roles cannot see the ledger
-- or the held-out churn ground truth at all.
-- ---------------------------------------------------------------------------

-- Consumer 1: the agent, via the Supabase MCP catalog connector (Phase 4).
-- Broad investigative reads, but read-only, scoped to customers/companies/
-- dunning_policy/product_usage — never the ledger, never the churn ground truth.
create role recoup_agent_readonly login password '<SET-A-REAL-RANDOM-PASSWORD>';
grant usage on schema public to recoup_agent_readonly;
grant select on public.customers to recoup_agent_readonly;
grant select on public.companies to recoup_agent_readonly;
grant select on public.dunning_policy to recoup_agent_readonly;
grant select on public.product_usage to recoup_agent_readonly;

-- Consumer 2: recoup-actions itself, via a direct Postgres connection
-- (Phase 5.5/5.6). Needs customers (LTV lookup) and dunning_policy read access,
-- plus insert-only on the ledger — never given broad write access anywhere.
create role recoup_actions_service login password '<SET-A-DIFFERENT-REAL-RANDOM-PASSWORD>';
grant usage on schema public to recoup_actions_service;
grant select on public.customers to recoup_actions_service;
grant select on public.companies to recoup_actions_service;
grant select on public.dunning_policy to recoup_actions_service;
grant select, insert on public.recovery_ledger to recoup_actions_service;

-- Consumer 3: a human/script only — scripts/score-account-health-eval.ts.
-- Never wired into mcp-server or any TrueForge connector. This is what makes
-- customer_churn_ground_truth an honest held-out eval set rather than
-- something the agent (or the agent's own tool server) could read.
create role recoup_eval_scorer login password '<SET-A-THIRD-REAL-RANDOM-PASSWORD>';
grant usage on schema public to recoup_eval_scorer;
grant select on public.customer_churn_ground_truth to recoup_eval_scorer;
grant select on public.customers to recoup_eval_scorer;

-- ---------------------------------------------------------------------------
-- Hardening: Supabase grants its PostgREST roles (anon, authenticated) full
-- CRUD on every new public-schema table by default — verified live on this
-- project on 2026-08-30: anon had INSERT/SELECT/UPDATE/DELETE/TRUNCATE on
-- customers, dunning_policy, recovery_ledger, and (had it not been caught
-- here) would have had the same on customer_churn_ground_truth, defeating
-- the entire point of holding that table out. This project's access model is
-- Postgres roles only (recoup_agent_readonly / recoup_actions_service /
-- recoup_eval_scorer) — nothing here is meant to be reachable via Supabase's
-- public Data API — so revoke the default grant entirely, both for existing
-- tables and for anything created after this script runs.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Use recoup_agent_readonly's credentials for the Supabase MCP connector
-- (Settings → Connectors in TrueForge) — this is the database-level backstop
-- for the harness-level `enable_tools: ["@read-only"]` restriction in
-- agent-spec.json. Use recoup_actions_service's credentials for the direct
-- Postgres connection wired into mcp-server (Phase 5.5/5.6), via Secret Manager,
-- never committed. recoup_eval_scorer's credentials are used only by a human
-- running scripts/score-account-health-eval.ts locally, also never committed.
