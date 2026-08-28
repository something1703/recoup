-- Schema + seed template for the Recoup demo. Run in the Supabase SQL editor of a
-- scratch/demo project (never a real production project) before connecting the
-- Supabase MCP.
--
-- This gives the agent something to JOIN against when it correlates a Stripe
-- customer ID with account value — the Code Mode step in the dunning-playbook
-- skill (step 3, "Quantify") reads from this table.
--
-- IMPORTANT: the `id` column must hold REAL Stripe customer IDs (cus_...), not
-- placeholders. Run scripts/seed-stripe-test-data.ts FIRST — it creates the Stripe
-- test customers and prints an INSERT block with their real IDs already filled in.
-- The rows below are illustrative only; replace them with that script's output.

create table if not exists public.customers (
  id text primary key,              -- a real Stripe customer ID, e.g. 'cus_Qi93x...'
  name text not null,
  plan text not null,               -- 'starter' | 'growth' | 'enterprise'
  mrr_usd numeric not null,
  ltv_tier text not null,           -- 'low' | 'medium' | 'high' — mirror of dunning_thresholds.ltv_tiers
  signup_date date not null
);

-- Illustrative only — overwrite with the INSERT block printed by seed-stripe-test-data.ts
insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date) values
  ('cus_REPLACE_ME_01', 'Bramwell & Foss',     'enterprise', 2400, 'high',   '2023-02-11'),
  ('cus_REPLACE_ME_02', 'Halcyon Robotics',    'growth',      620, 'high',   '2024-05-03'),
  ('cus_REPLACE_ME_03', 'Petal & Co',          'starter',      49, 'low',    '2025-01-19'),
  ('cus_REPLACE_ME_04', 'Northwind Analytics', 'growth',      340, 'medium', '2024-09-27')
on conflict (id) do nothing;

-- Recommended: expose this table read-only to the Supabase MCP role you connect
-- with (a read-only Postgres role, or Supabase's built-in read-only service role)
-- so the agent's `enable_tools: ["@read-only"]` restriction in agent-spec.json
-- has a real database-level backstop, not just a harness-level one.
