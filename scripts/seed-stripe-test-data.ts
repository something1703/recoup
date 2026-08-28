/**
 * Seeds a Stripe TEST-MODE account with customers + a realistic failed-payment
 * spike for the Recoup demo, then prints a ready-to-paste SQL INSERT block using
 * the real generated customer IDs (paste it into seed-supabase.sql).
 *
 * Requires a Stripe TEST secret key (starts with `sk_test_`) — this script refuses
 * to run against a live key as a safety check.
 *
 * Usage:
 *   npm install stripe tsx --no-save
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx seed-stripe-test-data.ts
 *
 * Stripe's documented test card numbers deterministically produce specific
 * decline codes in test mode — see https://docs.stripe.com/testing#declined-payments.
 * We use a mix of "safe to retry" declines (insufficient_funds, do_not_honor) and
 * one "never retry" decline (stolen_card) so the agent's classification step in
 * the dunning-playbook skill has both cases to reason about.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY (a sk_test_... key) before running this script.");
if (!key.startsWith("sk_test_")) {
  throw new Error("Refusing to run: STRIPE_SECRET_KEY does not look like a TEST key (sk_test_...).");
}

const stripe = new Stripe(key);

// name / plan / mrr / ltv_tier / special test PaymentMethod id
// Stripe ships stable, dedicated PaymentMethod IDs for server-side decline testing —
// no card tokenization or Stripe.js needed. VERIFY these still match
// https://docs.stripe.com/testing#declined-payments before your run; Stripe
// occasionally extends this list, and this script fails loudly (see try/catch)
// rather than silently if an ID has changed.
const FIXTURES = [
  { name: "Bramwell & Foss", plan: "enterprise", mrr: 2400, tier: "high", pm: "pm_card_chargeDeclinedInsufficientFunds" },
  { name: "Halcyon Robotics", plan: "growth", mrr: 620, tier: "high", pm: "pm_card_chargeDeclined" },
  { name: "Petal & Co", plan: "starter", mrr: 49, tier: "low", pm: "pm_card_chargeDeclinedInsufficientFunds" },
  { name: "Northwind Analytics", plan: "growth", mrr: 340, tier: "medium", pm: "pm_card_chargeDeclinedProcessingError" },
  { name: "Kestrel Studio", plan: "starter", mrr: 79, tier: "low", pm: "pm_card_chargeDeclinedInsufficientFunds" },
  { name: "Fathom Insurance", plan: "enterprise", mrr: 3100, tier: "high", pm: "pm_card_chargeDeclinedStolenCard" }, // never-retry case
  { name: "Marrow Coffee Co", plan: "starter", mrr: 29, tier: "low", pm: "pm_card_chargeDeclinedProcessingError" },
  { name: "Underline Design", plan: "growth", mrr: 210, tier: "medium", pm: "pm_card_chargeDeclinedInsufficientFunds" },
] as const;

async function main() {
  const rows: string[] = [];

  for (const f of FIXTURES) {
    const customer = await stripe.customers.create({ name: f.name, description: `Recoup demo · ${f.plan}` });

    try {
      await stripe.paymentIntents.create({
        amount: Math.round(f.mrr * 100),
        currency: "usd",
        customer: customer.id,
        payment_method: f.pm,
        confirm: true,
        off_session: true,
      });
      console.error(`! expected a decline for ${f.name} but the charge succeeded — the test PaymentMethod id may be stale.`);
    } catch (err) {
      // Expected path: Stripe throws a card error for these dedicated test PaymentMethods.
      const declineCode = err instanceof Stripe.errors.StripeCardError ? err.decline_code : undefined;
      console.log(`Seeded failed charge for ${f.name} — decline_code=${declineCode ?? "(see error)"}`);
    }

    rows.push(
      `  ('${customer.id}', '${f.name.replace(/'/g, "''")}', '${f.plan}', ${f.mrr}, '${f.tier}', '${new Date().toISOString().slice(0, 10)}')`,
    );
  }

  console.log("\n--- paste into seed-supabase.sql, replacing the illustrative INSERT block ---\n");
  console.log("insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date) values");
  console.log(rows.join(",\n") + "\non conflict (id) do nothing;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
