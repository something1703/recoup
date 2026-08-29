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
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/seed-stripe-test-data.ts
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
  const failures: string[] = [];

  for (const f of FIXTURES) {
    const customer = await stripe.customers.create({ name: f.name, description: `Recoup demo · ${f.plan}` });
    let declineCode: string | undefined;

    try {
      await stripe.paymentIntents.create({
        amount: Math.round(f.mrr * 100),
        currency: "usd",
        customer: customer.id,
        payment_method: f.pm,
        confirm: true,
        off_session: true,
      });
      failures.push(`${f.name}: expected a decline but the charge succeeded — the test PaymentMethod id may be stale.`);
    } catch (err) {
      // Expected path: Stripe throws a card error for these dedicated test PaymentMethods.
      // Anything else (network, auth, rate limit) is a real failure, not a seeded decline.
      if (err instanceof Stripe.errors.StripeCardError && err.decline_code) {
        declineCode = err.decline_code;
        console.log(`Seeded failed charge for ${f.name} — decline_code=${declineCode}`);
      } else {
        failures.push(`${f.name}: unexpected error, not a card decline — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (declineCode === undefined) {
      // No confirmed decline behind this customer — don't emit a Supabase row with
      // nothing for the agent to actually find. Clean up so the account stays tidy.
      await stripe.customers.del(customer.id).catch(() => {});
      continue;
    }

    rows.push(
      `  ('${customer.id}', '${f.name.replace(/'/g, "''")}', '${f.plan}', ${f.mrr}, '${f.tier}', '${new Date().toISOString().slice(0, 10)}')`,
    );
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} fixture(s) did not seed a matching failed charge:`);
    failures.forEach((f) => console.error(`  - ${f}`));
  }

  console.log("\n--- paste into seed-supabase.sql, replacing the illustrative INSERT block ---\n");
  console.log("insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date) values");
  console.log(rows.join(",\n") + "\non conflict (id) do nothing;");

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
