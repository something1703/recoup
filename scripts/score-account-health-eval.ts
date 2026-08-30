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

async function main() {
  const pool = new Pool({ host, port: 5432, user: "recoup_eval_scorer", database: "postgres", password, ssl: { rejectUnauthorized: false } });

  // Every customer_id the agent flagged as at-risk for Meridian, across every
  // real (non-dry-run) account-health ticket filed so far. A customer flagged
  // by more than one run is still "flagged" once — this scores the agent's
  // standing judgment, not how many times it repeated itself.
  const flaggedResult = await pool.query<{ customer_id: string }>(
    `select distinct jsonb_array_elements_text(outcome -> 'customer_ids') as customer_id
     from public.recovery_ledger
     where company_id = $1 and action_type = 'open_recovery_ticket' and outcome ->> 'dry_run' = 'false'`,
    [COMPANY_ID],
  );
  const flagged = new Set(flaggedResult.rows.map((r) => r.customer_id));

  if (flagged.size === 0) {
    console.log(
      "No real (non-dry-run) account-health tickets found for comp_meridian_telecom yet — nothing to score. " +
        "This only measures live runs; DRY_RUN=true rehearsals are excluded on purpose, same as /stats.",
    );
    await pool.end();
    return;
  }

  const groundTruth = await pool.query<{ customer_id: string; churned: boolean }>(
    `select g.customer_id, g.churned
     from public.customer_churn_ground_truth g
     join public.customers c on c.id = g.customer_id
     where c.company_id = $1`,
    [COMPANY_ID],
  );

  let truePositive = 0; // flagged AND actually churned
  let falsePositive = 0; // flagged AND did NOT churn
  let falseNegative = 0; // not flagged AND actually churned
  let trueNegative = 0; // not flagged AND did not churn
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
  const baseRate = totalChurned / groundTruth.rows.length;

  console.log(`comp_meridian_telecom account-health scoring — ${String(groundTruth.rows.length)} real customers, ${String(totalChurned)} actually churned (base rate ${(baseRate * 100).toFixed(1)}%)`);
  console.log(`Agent flagged ${String(flagged.size)} accounts as at-risk across all real runs.`);
  console.log({ truePositive, falsePositive, falseNegative, trueNegative });
  console.log(`Precision: ${(precision * 100).toFixed(1)}% (of accounts flagged, how many actually churned)`);
  console.log(`Recall: ${(recall * 100).toFixed(1)}% (of accounts that actually churned, how many the agent caught)`);
  console.log(
    `Naive baseline for comparison: flagging nothing scores 0%/0% precision/recall; flagging everything scores ${(baseRate * 100).toFixed(1)}%/100% — ` +
      "precision above the base rate with non-trivial recall is the bar for 'the agent's judgment beats guessing.'",
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
