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
-- 1. customers — the agent joins Stripe failures against this for LTV tiering.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id text primary key,              -- a real Stripe customer ID, e.g. 'cus_Qi93x...'
  name text not null,
  plan text not null,               -- 'starter' | 'growth' | 'enterprise'
  mrr_usd numeric not null,
  ltv_tier text not null,           -- 'low' | 'medium' | 'high' — mirror of dunning_policy.ltv_tiers
  signup_date date not null
);

-- Real Stripe TEST-mode customer IDs, printed by scripts/seed-stripe-test-data.ts
-- against the project's Stripe test-mode key and applied to the scratch Supabase
-- project on 2026-08-29. Re-run the seed script and replace this block if the
-- Stripe test data is ever reseeded (IDs regenerate on every run).
insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date) values
  ('cus_VA05dGTREwelwC', 'Bramwell & Foss', 'enterprise', 2400, 'high', '2026-08-29'),
  ('cus_VA05hRYXWOI1By', 'Halcyon Robotics', 'growth', 620, 'high', '2026-08-29'),
  ('cus_VA05uGoXTHlg6h', 'Petal & Co', 'starter', 49, 'low', '2026-08-29'),
  ('cus_VA05o7Y2w3fnco', 'Northwind Analytics', 'growth', 340, 'medium', '2026-08-29'),
  ('cus_VA050V3RKMfJ0s', 'Kestrel Studio', 'starter', 79, 'low', '2026-08-29'),
  ('cus_VA0522HvpyRtiK', 'Fathom Insurance', 'enterprise', 3100, 'high', '2026-08-29'),
  ('cus_VA05lBVZ9gFxoy', 'Marrow Coffee Co', 'starter', 29, 'low', '2026-08-29'),
  ('cus_VA05qiFPX9VPgO', 'Underline Design', 'growth', 210, 'medium', '2026-08-29')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. dunning_policy — replaces the DUNNING_THRESHOLDS const hardcoded in
--    mcp-server/src/index.ts. Single-row config table; editable without a
--    redeploy. get_dunning_thresholds (Phase 5) reads this instead of the const.
-- ---------------------------------------------------------------------------
create table if not exists public.dunning_policy (
  id boolean primary key default true check (id),  -- enforces exactly one row
  max_auto_retry_attempts int not null,
  never_retry_decline_codes text[] not null,
  safe_to_retry_decline_codes text[] not null,
  retry_backoff_hours int[] not null,
  ltv_tiers jsonb not null,          -- { high: {min_mrr_usd, escalate_to_human_always}, medium: {...}, low: {...} }
  updated_at date not null default current_date
);

insert into public.dunning_policy (
  max_auto_retry_attempts, never_retry_decline_codes, safe_to_retry_decline_codes,
  retry_backoff_hours, ltv_tiers
) values (
  2,
  array['stolen_card', 'lost_card', 'pickup_card', 'fraudulent'],
  array['insufficient_funds', 'do_not_honor', 'processing_error', 'try_again_later'],
  array[24, 72],
  '{"high": {"min_mrr_usd": 500, "escalate_to_human_always": true}, "medium": {"min_mrr_usd": 100}, "low": {"min_mrr_usd": 0}}'::jsonb
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. recovery_ledger — audit trail written by recoup-actions (Phase 5.6) after
--    every proposed batch/ticket. Source for the cockpit's cumulative "$
--    recovered" stat (Phase 9.7).
-- ---------------------------------------------------------------------------
create table if not exists public.recovery_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_type text not null check (action_type in ('retry_eligible_charges', 'open_recovery_ticket')),
  reason text not null,
  human_decision text not null check (human_decision in ('allow', 'deny')),
  charge_ids text[],                -- populated for retry_eligible_charges
  linear_issue_id text,             -- populated for open_recovery_ticket
  outcome jsonb not null            -- per-charge status array, or the created issue
);

-- ---------------------------------------------------------------------------
-- Roles — two, matching the two consumers described above. Least privilege:
-- neither can write to a table it has no business writing to, and the agent's
-- role cannot see the policy or ledger tables at all.
-- ---------------------------------------------------------------------------

-- Consumer 1: the agent, via the Supabase MCP catalog connector (Phase 4).
-- Broad investigative reads, but read-only, and scoped to customers only.
create role recoup_agent_readonly login password '<SET-A-REAL-RANDOM-PASSWORD>';
grant usage on schema public to recoup_agent_readonly;
grant select on public.customers to recoup_agent_readonly;

-- Consumer 2: recoup-actions itself, via a direct Postgres connection
-- (Phase 5.5/5.6). Needs customers (LTV lookup) and dunning_policy read access,
-- plus insert-only on the ledger — never given broad write access anywhere.
create role recoup_actions_service login password '<SET-A-DIFFERENT-REAL-RANDOM-PASSWORD>';
grant usage on schema public to recoup_actions_service;
grant select on public.customers to recoup_actions_service;
grant select on public.dunning_policy to recoup_actions_service;
grant select, insert on public.recovery_ledger to recoup_actions_service;

-- Use recoup_agent_readonly's credentials for the Supabase MCP connector
-- (Settings → Connectors in TrueForge) — this is the database-level backstop
-- for the harness-level `enable_tools: ["@read-only"]` restriction in
-- agent-spec.json. Use recoup_actions_service's credentials for the direct
-- Postgres connection wired into mcp-server (Phase 5.5/5.6), via Secret Manager,
-- never committed.
