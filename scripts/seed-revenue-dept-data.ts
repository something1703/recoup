/**
 * Seeds the data the billing-integrity and account-health desks investigate:
 *
 *  1. Real Stripe TEST-MODE subscriptions for existing seeded customers — with
 *     two DELIBERATE mismatches against the Supabase customers table:
 *       - Fathom Insurance: DB says enterprise ($3,100 MRR) but Stripe bills
 *         $2,400 → silent UNDER-charging, $8,400/yr of invisible leakage.
 *       - Kestrel Studio: DB says starter ($79) but Stripe bills $109 →
 *         OVER-charging, a refund/goodwill risk the desk must also catch.
 *     The rest match exactly — a correct investigation flags only the two.
 *
 *  2. SQL for a product_usage table: seats/quota consumption per customer,
 *     with one expansion-ready account (seats maxed) and one churn-risk
 *     account (barely active) planted for the account-health desk.
 *
 * Separate from seed-stripe-test-data.ts on purpose — the dunning fixtures
 * are frozen per docs/DEMO_SCRIPT.md and this never touches them.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/seed-revenue-dept-data.ts
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY (a sk_test_... key) before running this script.");
if (!key.startsWith("sk_test_")) {
  throw new Error("Refusing to run: STRIPE_SECRET_KEY does not look like a TEST key (sk_test_...).");
}

const stripe = new Stripe(key);

// Existing seeded customer IDs (from seed-stripe-test-data.ts's frozen run) with
// the monthly amount Stripe should bill. `db_mrr` is what the Supabase table
// says — the two rows where they differ are the planted mismatches.
const SUBSCRIPTIONS = [
  { id: "cus_VA05dGTREwelwC", name: "Bramwell & Foss", db_mrr: 2400, stripe_mrr: 2400 },
  { id: "cus_VA05hRYXWOI1By", name: "Halcyon Robotics", db_mrr: 620, stripe_mrr: 620 },
  { id: "cus_VA0522HvpyRtiK", name: "Fathom Insurance", db_mrr: 3100, stripe_mrr: 2400 }, // undercharged $700/mo
  { id: "cus_VA05o7Y2w3fnco", name: "Northwind Analytics", db_mrr: 340, stripe_mrr: 340 },
  { id: "cus_VA050V3RKMfJ0s", name: "Kestrel Studio", db_mrr: 79, stripe_mrr: 109 }, // overcharged $30/mo
  { id: "cus_VA05qiFPX9VPgO", name: "Underline Design", db_mrr: 210, stripe_mrr: 210 },
] as const;

async function main() {
  const product = await stripe.products.create({ name: "Recoup Demo SaaS Plan" });

  for (const s of SUBSCRIPTIONS) {
    // Each customer gets a price at exactly what Stripe "actually" bills them.
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: s.stripe_mrr * 100,
      currency: "usd",
      recurring: { interval: "month" },
      nickname: `${s.name} monthly`,
    });
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: s.id }).catch(async () => {
      // pm_card_visa is single-use per attach in some API versions — create a fresh one.
      const fresh = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
      return stripe.paymentMethods.attach(fresh.id, { customer: s.id });
    });
    await stripe.customers.update(s.id, { invoice_settings: { default_payment_method: pm.id } });
    const sub = await stripe.subscriptions.create({ customer: s.id, items: [{ price: price.id }] });
    const flag = s.db_mrr === s.stripe_mrr ? "" : `  <-- MISMATCH (DB says $${String(s.db_mrr)})`;
    console.log(`Subscribed ${s.name} at $${String(s.stripe_mrr)}/mo (${sub.status})${flag}`);
  }

  console.log(`
--- run in the Supabase SQL editor: the account-health desk's usage data ---

create table if not exists public.product_usage (
  customer_id text primary key references public.customers(id),
  seats_included int not null,
  seats_used int not null,
  api_quota_30d int not null,
  api_calls_30d int not null,
  last_active_date date not null
);
grant select on public.product_usage to recoup_agent_readonly;
grant select on public.product_usage to recoup_actions_service;

insert into public.product_usage values
  ('cus_VA05dGTREwelwC', 50, 48, 1000000, 940000, current_date),               -- Bramwell: seats maxed -> expansion-ready
  ('cus_VA05hRYXWOI1By', 20, 14, 500000, 310000, current_date - 2),            -- Halcyon: healthy
  ('cus_VA0522HvpyRtiK', 100, 61, 2000000, 1100000, current_date - 1),         -- Fathom: healthy
  ('cus_VA05o7Y2w3fnco', 10, 9, 200000, 195000, current_date),                 -- Northwind: seats+quota near limit -> expansion-ready
  ('cus_VA050V3RKMfJ0s', 5, 1, 50000, 1200, current_date - 44),                -- Kestrel: 1/5 seats, idle 44d -> churn risk
  ('cus_VA05qiFPX9VPgO', 10, 6, 200000, 88000, current_date - 3)               -- Underline: healthy
on conflict (customer_id) do nothing;
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
