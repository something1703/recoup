/**
 * Scores the account-health desk's real classifications against the REAL,
 * held-out Churn outcome from the IBM Telco Customer Churn dataset.
 *
 * This is the mechanism that makes "we benchmarked the agent against real
 * recorded outcomes" a checkable fact rather than a claim: it reads the
 * customer_ids the agent actually flagged (from open_recovery_ticket calls
 * recorded in the ledger for comp_meridian_telecom) and compares them against
 * customer_churn_ground_truth — a table neither the agent nor mcp-server's
 * own tool logic can read (see seed-supabase.sql's role grants). Nothing
 * here calls a model — this is a plain, deterministic comparison, on
 * purpose: scoring a classification should not itself cost tokens or be
 * eyeballed from raw JSON, the same discipline the playbooks apply to their
 * own dollar figures.
 *
 * Scoring is scoped to account_health_reviews, not the full ~7,043-customer
 * population: get_account_usage is capped at 50 IDs/call, so the agent only
 * ever looks at a bounded shortlist per run. Treating every customer it never
 * reviewed as a "predicted healthy" negative would manufacture a huge, wrong
 * recall denominator — precision/recall below are computed only over
 * customers that were actually reviewed at least once.
 *
 * Usage (uses recoup_eval_scorer — never recoup_agent_readonly/actions_service):
 *   SUPABASE_DB_HOST=... SUPABASE_EVAL_SCORER_PASSWORD=... npx tsx scripts/score-account-health-eval.ts
 */

import { Pool } from "pg";

const COMPANY_ID = "comp_meridian_telecom";

const host = process.env.SUPABASE_DB_HOST;
const password = process.env.SUPABASE_EVAL_SCORER_PASSWORD;
if (!host || !password) {
  throw new Error("Set SUPABASE_DB_HOST and SUPABASE_EVAL_SCORER_PASSWORD (the recoup_eval_scorer role) before running this.");
}

// Reads three independent sources and joins them in plain JS rather than one
// SQL query — precision/recall depend on getting the "reviewed but not
// flagged = predicted healthy" logic right, which is easier to get right (and
// verify) as explicit set operations than as a single nested SQL expression.
async function main() {
  const pool = new Pool({ host, port: 5432, user: "recoup_eval_scorer", database: "postgres", password, ssl: { rejectUnauthorized: false } });

  const reviewedResult = await pool.query<{ customer_id: string }>(
    `select customer_id from public.account_health_reviews where company_id = $1`,
    [COMPANY_ID],
  );
  const reviewed = new Set(reviewedResult.rows.map((r) => r.customer_id));

  if (reviewed.size === 0) {
    console.log(
      "No account_health_reviews found for comp_meridian_telecom yet — the agent hasn't run get_account_usage " +
        "against this tenant, so there's nothing to score.",
    );
    await pool.end();
    return;
  }

  // Guard against tickets with no customer_ids (a plain engineering-bug
  // ticket stores JSON null there) — jsonb_array_elements_text throws on a
  // scalar, so only unnest rows where the value is actually a JSON array.
  const flaggedResult = await pool.query<{ customer_id: string }>(
    `select distinct jsonb_array_elements_text(outcome -> 'customer_ids') as customer_id
     from public.recovery_ledger
     where company_id = $1
       and action_type = 'open_recovery_ticket'
       and outcome ->> 'dry_run' = 'false'
       and jsonb_typeof(outcome -> 'customer_ids') = 'array'`,
    [COMPANY_ID],
  );
  const flaggedRaw = new Set(flaggedResult.rows.map((r) => r.customer_id));

  // A flagged ID outside the reviewed set is itself a signal something's
  // wrong (a hallucinated ID, a cross-tenant mixup) — surface it rather than
  // silently let it inflate "flagged" without ever appearing in TP/FP below.
  const flaggedUnreviewed = [...flaggedRaw].filter((id) => !reviewed.has(id));
  const flagged = new Set([...flaggedRaw].filter((id) => reviewed.has(id)));

  const groundTruth = await pool.query<{ customer_id: string; churned: boolean }>(
    `select g.customer_id, g.churned
     from public.customer_churn_ground_truth g
     join public.customers c on c.id = g.customer_id
     where c.company_id = $1 and g.customer_id = any($2::text[])`,
    [COMPANY_ID, [...reviewed]],
  );

  let truePositive = 0; // flagged AND actually churned
  let falsePositive = 0; // flagged AND did NOT churn
  let falseNegative = 0; // reviewed, not flagged, AND actually churned
  let trueNegative = 0; // reviewed, not flagged, AND did not churn
  let totalChurned = 0;

  for (const row of groundTruth.rows) {
    const wasFlagged = flagged.has(row.customer_id);
    if (row.churned) totalChurned++;
    if (wasFlagged && row.churned) truePositive++;
    else if (wasFlagged && !row.churned) falsePositive++;
    else if (!wasFlagged && row.churned) falseNegative++;
    else trueNegative++;
  }

  const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 0;
  const baseRate = groundTruth.rows.length > 0 ? totalChurned / groundTruth.rows.length : 0;

  console.log(
    `comp_meridian_telecom account-health scoring — ${String(groundTruth.rows.length)} reviewed customers with ground truth, ` +
      `${String(totalChurned)} actually churned (base rate ${(baseRate * 100).toFixed(1)}% within the reviewed set).`,
  );
  console.log(`Agent flagged ${String(flagged.size)} of the reviewed accounts as at-risk.`);
  if (flaggedUnreviewed.length > 0) {
    console.log(`WARNING: ${String(flaggedUnreviewed.length)} flagged customer_id(s) were never reviewed via get_account_usage — excluded from scoring:`, flaggedUnreviewed);
  }
  console.log({ truePositive, falsePositive, falseNegative, trueNegative });
  console.log(`Precision: ${(precision * 100).toFixed(1)}% (of accounts flagged, how many actually churned)`);
  console.log(`Recall: ${(recall * 100).toFixed(1)}% (of reviewed accounts that actually churned, how many the agent caught)`);
  console.log(
    `Naive baseline for comparison, within this same reviewed set: flagging nothing scores 0%/0% precision/recall; ` +
      `flagging everyone scores ${(baseRate * 100).toFixed(1)}%/100% — precision above the base rate with non-trivial recall ` +
      "is the bar for 'the agent's judgment beats guessing.'",
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
