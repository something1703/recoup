/**
 * Seeds Stripe TEST-MODE with succeeded-then-refunded charges for the
 * refund-abuse-playbook — a separate script from seed-stripe-test-data.ts on
 * purpose: the dunning fixtures are frozen per docs/DEMO_SCRIPT.md, and this
 * never touches them.
 *
 * The shape is deliberate, mirroring what the playbook must distinguish:
 *   - One serial-refunder pattern (same customer, three purchase→refund cycles,
 *     each refund requested_by_customer) — the abuse-shaped signal.
 *   - Two ordinary one-off refunds on unrelated customers — background noise a
 *     correct classification should NOT flag.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/seed-refund-test-data.ts
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY (a sk_test_... key) before running this script.");
if (!key.startsWith("sk_test_")) {
  throw new Error("Refusing to run: STRIPE_SECRET_KEY does not look like a TEST key (sk_test_...).");
}

const stripe = new Stripe(key);

// name / plan / mrr / tier / list of charge amounts (usd) to succeed then refund
const FIXTURES = [
  // The abuse pattern: three cycles on one low-value account.
  { name: "Vellum Papercraft", plan: "starter", mrr: 39, tier: "low", refunds: [39, 39, 39] },
  // Ordinary one-off refunds — should classify as background noise.
  { name: "Quarry Analytics", plan: "growth", mrr: 280, tier: "medium", refunds: [280] },
  { name: "Lantern Legal", plan: "starter", mrr: 59, tier: "low", refunds: [59] },
] as const;

// Seeds Stripe first, then prints the matching customers SQL — the fixture's
// real Stripe customer IDs don't exist until Stripe assigns them, so the two
// can't be authored together ahead of time.
async function main() {
  const rows: string[] = [];

  for (const f of FIXTURES) {
    const customer = await stripe.customers.create({ name: f.name, description: `Recoup refund demo · ${f.plan}` });

    for (const amountUsd of f.refunds) {
      // pm_card_visa succeeds deterministically in test mode; refund immediately after.
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amountUsd * 100),
        currency: "usd",
        customer: customer.id,
        payment_method: "pm_card_visa",
        confirm: true,
        off_session: true,
      });
      if (intent.status !== "succeeded") {
        throw new Error(`Expected pm_card_visa to succeed for ${f.name}, got status=${intent.status} — aborting, nothing to refund.`);
      }
      await stripe.refunds.create({ payment_intent: intent.id, reason: "requested_by_customer" });
      console.log(`Seeded succeeded+refunded charge for ${f.name} — $${String(amountUsd)}`);
    }

    rows.push(
      `  ('${customer.id}', '${f.name.replace(/'/g, "''")}', '${f.plan}', ${String(f.mrr)}, '${f.tier}', '${new Date().toISOString().slice(0, 10)}', 'comp_ferro_commerce')`,
    );
  }

  console.log("\n--- paste into the customers table (Supabase SQL editor) so get_customer_ltv can tier these ---\n");
  console.log("insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date, company_id) values");
  console.log(rows.join(",\n") + "\non conflict (id) do nothing;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
