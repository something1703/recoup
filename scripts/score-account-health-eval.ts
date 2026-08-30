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
 * Time-scoped to one evaluation window, not all history: without a boundary,
 * two different investigation runs (possibly different prompts, different
 * code versions) blend into one confusion matrix — an account flagged by any
 * run ever stays "flagged" forever, and old reviews never leave the reviewed
 * set. Defaults to the last 24 hours (one sitting's worth of testing);
 * override with --since or widen deliberately with --all-time.
 *
 * Alongside the agent's numbers it scores a REAL competing baseline over the
 * exact same reviewed set — the one-line rule "flag every month-to-month
 * contract" (the strongest trivial heuristic on this dataset) — because
 * "we scored the agent" only means something next to what the obvious
 * alternative scores. Results are also written as a JSON artifact under
 * scripts/eval-results/ so a run can be cited, diffed, and rerun rather than
 * scrolling back a terminal.
 *
 * HONEST LIMITATIONS — state these anywhere these numbers are shown:
 *  1. The Telco Churn dataset is public and widely used in tutorials; the
 *     underlying model has almost certainly seen it in training. The DB-level
 *     holdout is real (no agent-facing role can read the outcome column), but
 *     it cannot un-train a model. The number still measures something useful —
 *     whether THIS agent, from THESE observable fields, flags the accounts
 *     that really churned — but it is not a leak-proof benchmark.
 *  2. The reviewed set is agent-selected (the agent picks its own shortlist),
 *     so this is precision/recall on a self-chosen slice, not a stratified
 *     random sample.
 *  3. A human Deny on a proposed ticket erases that prediction from the
 *     ledger (TrueForge never calls the tool on Deny), so a denied flag
 *     scores as a false negative. The eval measures the agent+approval
 *     pipeline jointly, not the agent alone.
 *
 * Usage (uses recoup_eval_scorer — never recoup_agent_readonly/actions_service):
 *   SUPABASE_DB_HOST=... SUPABASE_EVAL_SCORER_PASSWORD=... npx tsx scripts/score-account-health-eval.ts [--since <ISO-8601>] [--all-time]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { Pool } from "pg";

const COMPANY_ID = "comp_meridian_telecom";
const DEFAULT_WINDOW_HOURS = 24;

// Wilson score interval — honest error bars for proportions at the small n a
// single agent run produces (a bare "83.3%" over 6 flags is not a finding).
function wilson(successes: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

type ConfusionMatrix = { truePositive: number; falsePositive: number; falseNegative: number; trueNegative: number };

function score(flagged: Set<string>, truth: { customer_id: string; churned: boolean }[]): ConfusionMatrix & { precision: number; recall: number } {
  const m: ConfusionMatrix = { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 };
  for (const row of truth) {
    const wasFlagged = flagged.has(row.customer_id);
    if (wasFlagged && row.churned) m.truePositive++;
    else if (wasFlagged && !row.churned) m.falsePositive++;
    else if (!wasFlagged && row.churned) m.falseNegative++;
    else m.trueNegative++;
  }
  return {
    ...m,
    precision: m.truePositive + m.falsePositive > 0 ? m.truePositive / (m.truePositive + m.falsePositive) : 0,
    recall: m.truePositive + m.falseNegative > 0 ? m.truePositive / (m.truePositive + m.falseNegative) : 0,
  };
}

const host = process.env.SUPABASE_DB_HOST;
const password = process.env.SUPABASE_EVAL_SCORER_PASSWORD;
if (!host || !password) {
  throw new Error("Set SUPABASE_DB_HOST and SUPABASE_EVAL_SCORER_PASSWORD (the recoup_eval_scorer role) before running this.");
}

function resolveSince(argv: string[]): Date | null {
  if (argv.includes("--all-time")) return null;
  const sinceIndex = argv.indexOf("--since");
  if (sinceIndex !== -1 && argv[sinceIndex + 1]) {
    const parsed = new Date(argv[sinceIndex + 1]!);
    if (Number.isNaN(parsed.getTime())) throw new Error(`--since value is not a valid date: ${argv[sinceIndex + 1]}`);
    return parsed;
  }
  return new Date(Date.now() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000);
}

// Reads three independent sources and joins them in plain JS rather than one
// SQL query — precision/recall depend on getting the "reviewed but not
// flagged = predicted healthy" logic right, which is easier to get right (and
// verify) as explicit set operations than as a single nested SQL expression.
async function main() {
  const since = resolveSince(process.argv.slice(2));
  const pool = new Pool({ host, port: 5432, user: "recoup_eval_scorer", database: "postgres", password, ssl: { rejectUnauthorized: false } });

  console.log(
    since ? `Scoring window: reviews/tickets since ${since.toISOString()} (pass --all-time to score every run ever, or --since <ISO-8601> for a specific cutoff).` : "Scoring window: --all-time (every run ever, may blend multiple investigation runs together).",
  );

  const reviewedResult = await pool.query<{ customer_id: string }>(
    `select customer_id from public.account_health_reviews where company_id = $1 and ($2::timestamptz is null or last_reviewed_at >= $2)`,
    [COMPANY_ID, since],
  );
  const reviewed = new Set(reviewedResult.rows.map((r) => r.customer_id));

  if (reviewed.size === 0) {
    console.log(
      "No account_health_reviews found for comp_meridian_telecom in this window — the agent hasn't run get_account_usage " +
        "against this tenant recently, so there's nothing to score. Try --all-time or an earlier --since.",
    );
    await pool.end();
    return;
  }

  // Guard against tickets with no customer_ids (a plain engineering-bug
  // ticket stores JSON null there) — jsonb_array_elements_text throws on a
  // scalar, so only unnest rows where the value is actually a JSON array.
  const flaggedResult = await pool.query<{ customer_id: string }>(
    // No dry_run filter, deliberately unlike /stats: DRY_RUN only controls
    // whether a REAL Linear ticket gets filed — it never changes the agent's
    // own classification, so a dry-run ticket's customer_ids are exactly as
    // real a prediction as a live one. Excluding them here (as /stats
    // correctly does for dollar totals, to avoid inflating a real-money
    // claim) would leave this scorer with nothing to score under the
    // project's own DRY_RUN=true default and silently report 0% on every run.
    `select distinct jsonb_array_elements_text(outcome -> 'customer_ids') as customer_id
     from public.recovery_ledger
     where company_id = $1
       and action_type = 'open_recovery_ticket'
       and jsonb_typeof(outcome -> 'customer_ids') = 'array'
       and ($2::timestamptz is null or created_at >= $2)`,
    [COMPANY_ID, since],
  );
  const flaggedRaw = new Set(flaggedResult.rows.map((r) => r.customer_id));

  // A flagged ID outside the reviewed set is itself a signal something's
  // wrong (a hallucinated ID, a cross-tenant mixup) — surface it rather than
  // silently let it inflate "flagged" without ever appearing in TP/FP below.
  const flaggedUnreviewed = [...flaggedRaw].filter((id) => !reviewed.has(id));
  const flagged = new Set([...flaggedRaw].filter((id) => reviewed.has(id)));

  const groundTruth = await pool.query<{ customer_id: string; churned: boolean; contract_type: string | null }>(
    `select g.customer_id, g.churned, c.contract_type
     from public.customer_churn_ground_truth g
     join public.customers c on c.id = g.customer_id
     where c.company_id = $1 and g.customer_id = any($2::text[])`,
    [COMPANY_ID, [...reviewed]],
  );

  const agent = score(flagged, groundTruth.rows);
  const totalChurned = groundTruth.rows.filter((r) => r.churned).length;
  const baseRate = groundTruth.rows.length > 0 ? totalChurned / groundTruth.rows.length : 0;

  // The competing one-line rule, on the exact same reviewed set: flag every
  // month-to-month contract. This is the strongest trivial heuristic on this
  // dataset — if the agent can't beat it, that result gets reported too.
  const ruleFlagged = new Set(groundTruth.rows.filter((r) => r.contract_type === "Month-to-month").map((r) => r.customer_id));
  const rule = score(ruleFlagged, groundTruth.rows);

  const precisionCi = wilson(agent.truePositive, agent.truePositive + agent.falsePositive);
  const recallCi = wilson(agent.truePositive, agent.truePositive + agent.falseNegative);

  console.log(
    `comp_meridian_telecom account-health scoring — ${String(groundTruth.rows.length)} reviewed customers with ground truth, ` +
      `${String(totalChurned)} actually churned (base rate ${pct(baseRate)} within the reviewed set).`,
  );
  console.log(`Agent flagged ${String(flagged.size)} of the reviewed accounts as at-risk.`);
  if (flaggedUnreviewed.length > 0) {
    console.log(`WARNING: ${String(flaggedUnreviewed.length)} flagged customer_id(s) were never reviewed via get_account_usage — excluded from scoring:`, flaggedUnreviewed);
  }
  console.log({ truePositive: agent.truePositive, falsePositive: agent.falsePositive, falseNegative: agent.falseNegative, trueNegative: agent.trueNegative });
  console.log(`Precision: ${pct(agent.precision)} [95% CI ${pct(precisionCi.low)}–${pct(precisionCi.high)}] (of accounts flagged, how many actually churned)`);
  console.log(`Recall: ${pct(agent.recall)} [95% CI ${pct(recallCi.low)}–${pct(recallCi.high)}] (of reviewed accounts that actually churned, how many the agent caught)`);
  console.log("");
  console.log("Same reviewed set, competing strategies:");
  console.log(`  flag nothing:                 precision 0.0%, recall 0.0%`);
  console.log(`  flag everyone:                precision ${pct(baseRate)}, recall 100.0%`);
  console.log(`  flag all month-to-month:      precision ${pct(rule.precision)}, recall ${pct(rule.recall)} (flags ${String(ruleFlagged.size)})`);
  console.log(`  the agent:                    precision ${pct(agent.precision)}, recall ${pct(agent.recall)} (flags ${String(flagged.size)})`);
  console.log("");
  console.log("Read the header comment's HONEST LIMITATIONS before citing these numbers anywhere.");

  // Persist the run so it can be cited and compared, not just scrolled past.
  const artifact = {
    ran_at: new Date().toISOString(),
    company_id: COMPANY_ID,
    window_since: since?.toISOString() ?? "all-time",
    reviewed_with_ground_truth: groundTruth.rows.length,
    base_rate: baseRate,
    flagged_unreviewed: flaggedUnreviewed,
    agent: { ...agent, precision_ci95: precisionCi, recall_ci95: recallCi, flagged: flagged.size },
    baseline_flag_all_month_to_month: { ...rule, flagged: ruleFlagged.size },
  };
  mkdirSync("scripts/eval-results", { recursive: true });
  const outPath = `scripts/eval-results/${artifact.ran_at.replace(/[:.]/g, "-")}.json`;
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`\nRun artifact written to ${outPath}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
