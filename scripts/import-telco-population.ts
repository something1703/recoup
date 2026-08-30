/**
 * Imports the real IBM Telco Customer Churn dataset (7,043 real anonymized
 * telecom subscribers) as the customer population for comp_meridian_telecom.
 *
 * This is NOT a fixture generator: every row's tenure, monthly charge,
 * contract type, payment method, and churn outcome is a real recorded value
 * from the dataset. We only choose how to MAP those real fields onto our
 * schema — we do not invent the underlying facts:
 *
 *   tenure (months)      -> tenure_months, and signup_date derived from it
 *   Contract             -> plan (free-text; different tenants use this field
 *                           for different concepts, see seed-supabase.sql)
 *   PaymentMethod        -> payment_method
 *   MonthlyCharges       -> mrr_usd
 *   TotalCharges         -> total_charges_usd
 *   Churn ('Yes'/'No')   -> customer_churn_ground_truth.churned — HELD OUT,
 *                           never exposed to the agent (see the migration's
 *                           role grants). The account-health desk must
 *                           classify risk from the other columns alone;
 *                           scripts/score-account-health-eval.ts is the only
 *                           thing that ever reads this table.
 *
 * ltv_tier uses comp_meridian_telecom's real percentile-grounded thresholds
 * from dunning_policy (>= $95 high, >= $55 medium) — the same cutoffs the
 * dunning/retry logic itself uses, so tiering is coherent across desks.
 *
 * Download the dataset first:
 *   mkdir -p scripts/data && curl -sL -o scripts/data/telco-customer-churn.csv \
 *     https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv
 *
 * Usage (defaults reproduce this project's own Meridian Telecom demo data):
 *   SUPABASE_DB_HOST=... SUPABASE_DB_PASSWORD=... npx tsx scripts/import-telco-population.ts
 *
 * To bring your own tenant instead of Meridian's data, pass a company_id and
 * a CSV in the same shape (customerID, tenure, Contract, PaymentMethod,
 * MonthlyCharges, TotalCharges, Churn):
 *   SUPABASE_DB_HOST=... SUPABASE_DB_PASSWORD=... npx tsx scripts/import-telco-population.ts \
 *     --company-id comp_your_company --csv path/to/your-customers.csv
 * The company_id must already exist in public.companies (insert it first —
 * see "Bring your own tenant" in README.md) and have its own dunning_policy
 * row, since ltv_tier here reuses the same >=$95/>=$55 cutoffs as Meridian's
 * policy — override ltvTier() below if your tenant's thresholds differ.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    csvPath: get("--csv") ?? "scripts/data/telco-customer-churn.csv",
    companyId: get("--company-id") ?? "comp_meridian_telecom",
  };
}

const { csvPath: CSV_PATH, companyId: COMPANY_ID } = parseArgs(process.argv.slice(2));

const host = process.env.SUPABASE_DB_HOST;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!host || !password) {
  throw new Error("Set SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD (the postgres superuser role) before running this.");
}

type Row = {
  id: string;
  name: string;
  plan: string;
  mrrUsd: number;
  ltvTier: "high" | "medium" | "low";
  signupDate: string;
  tenureMonths: number;
  contractType: string;
  paymentMethod: string;
  totalChargesUsd: number;
  churned: boolean;
};

// Same cutoffs as comp_meridian_telecom's dunning_policy.ltv_tiers — grounded
// in the dataset's own real percentiles (p90 MonthlyCharges = 102.60), not
// invented separately from the retry-escalation logic.
function ltvTier(monthlyCharges: number): "high" | "medium" | "low" {
  if (monthlyCharges >= 95) return "high";
  if (monthlyCharges >= 55) return "medium";
  return "low";
}

function planFromContract(contract: string): string {
  return contract.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
}

function signupDateFromTenure(tenureMonths: number): string {
  const d = new Date();
  d.setUTCDate(1); // avoid month-length overflow surprises (e.g. Jan 31 - 1mo)
  d.setUTCMonth(d.getUTCMonth() - tenureMonths);
  return d.toISOString().slice(0, 10);
}

// Hand-rolled split on "," rather than a CSV library: the real dataset has no
// quoted/escaped commas in any field, verified against the actual file.
function parseCsv(text: string, companyId: string): Row[] {
  // Derived from the tenant, not hardcoded to "merid_" — a second
  // Telco-shaped tenant importing the same public dataset would otherwise
  // collide on customers.id (global primary key, not scoped per company).
  const idPrefix = companyId.replace(/^comp_/, "").slice(0, 8) + "_";
  const lines = text.trim().split("\n");
  const header = lines[0]!.split(",");
  const idx = (col: string) => {
    const i = header.indexOf(col);
    if (i === -1) throw new Error(`Column "${col}" not found in CSV header — did the dataset format change?`);
    return i;
  };
  const iId = idx("customerID");
  const iTenure = idx("tenure");
  const iContract = idx("Contract");
  const iPayment = idx("PaymentMethod");
  const iMonthly = idx("MonthlyCharges");
  const iTotal = idx("TotalCharges");
  const iChurn = idx("Churn");

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const monthlyCharges = Number(cols[iMonthly]);
    // TotalCharges has a handful of blank values in the real dataset
    // (brand-new customers with tenure 0) — fall back to monthlyCharges.
    const totalRaw = cols[iTotal]?.trim();
    const totalChargesUsd = totalRaw ? Number(totalRaw) : monthlyCharges;
    const tenureMonths = Number(cols[iTenure]);
    const realId = cols[iId]!;

    return {
      // The dataset's real IDs (e.g. "7590-VHVEG") aren't Stripe customer
      // IDs — prefix them so they're visibly distinct from any tenant's
      // real cus_... IDs rather than looking like a Stripe object they aren't.
      id: `${idPrefix}${realId}`,
      // Pseudonym, NOT the raw dataset ID: the agent sees customer names in
      // every get_account_usage/list_customers response, and handing it the
      // verbatim Kaggle customerID would give a dataset-memorizing model a
      // direct join key back to the published churn labels. Deterministic
      // (sha256 of the real ID) so re-imports are stable.
      name: `Subscriber ${createHash("sha256").update(realId).digest("hex").slice(0, 8).toUpperCase()}`,
      plan: planFromContract(cols[iContract]!),
      mrrUsd: monthlyCharges,
      ltvTier: ltvTier(monthlyCharges),
      signupDate: signupDateFromTenure(tenureMonths),
      tenureMonths,
      contractType: cols[iContract]!,
      paymentMethod: cols[iPayment]!,
      totalChargesUsd,
      churned: cols[iChurn]!.trim() === "Yes",
    };
  });
}

// Chunked (500/batch) rather than one giant statement: Postgres has a real
// param-count ceiling, and batching also gives visible progress on 7k+ rows.
async function main() {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"), COMPANY_ID);
  console.log(`Parsed ${String(rows.length)} real subscriber rows from ${CSV_PATH}`);

  const pool = new Pool({ host, port: 5432, user: "postgres", database: "postgres", password, ssl: { rejectUnauthorized: false } });

  const CHUNK = 500;
  let customersInserted = 0;
  let groundTruthInserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    const custParams: unknown[] = [];
    const custPlaceholders = chunk.map((r, j) => {
      const b = j * 11;
      custParams.push(r.id, r.name, r.plan, r.mrrUsd, r.ltvTier, r.signupDate, COMPANY_ID, r.tenureMonths, r.contractType, r.paymentMethod, r.totalChargesUsd);
      return `($${String(b + 1)}, $${String(b + 2)}, $${String(b + 3)}, $${String(b + 4)}, $${String(b + 5)}, $${String(b + 6)}, $${String(b + 7)}, $${String(b + 8)}, $${String(b + 9)}, $${String(b + 10)}, $${String(b + 11)})`;
    });
    await pool.query(
      `insert into public.customers (id, name, plan, mrr_usd, ltv_tier, signup_date, company_id, tenure_months, contract_type, payment_method, total_charges_usd)
       values ${custPlaceholders.join(",\n")}
       on conflict (id) do update set name = excluded.name`,
      custParams,
    );
    customersInserted += chunk.length;

    const gtParams: unknown[] = [];
    const gtPlaceholders = chunk.map((r, j) => {
      const b = j * 2;
      gtParams.push(r.id, r.churned);
      return `($${String(b + 1)}, $${String(b + 2)})`;
    });
    await pool.query(
      `insert into public.customer_churn_ground_truth (customer_id, churned)
       values ${gtPlaceholders.join(",\n")}
       on conflict (customer_id) do nothing`,
      gtParams,
    );
    groundTruthInserted += chunk.length;

    console.log(`  ${String(Math.min(i + CHUNK, rows.length))}/${String(rows.length)}`);
  }

  const verify = await pool.query(
    "select count(*) as customers, count(*) filter (where ltv_tier = 'high') as high, count(*) filter (where ltv_tier = 'medium') as medium, count(*) filter (where ltv_tier = 'low') as low from public.customers where company_id = $1",
    [COMPANY_ID],
  );
  const gtVerify = await pool.query(
    "select count(*) as total, count(*) filter (where churned) as churned from public.customer_churn_ground_truth g join public.customers c on c.id = g.customer_id where c.company_id = $1",
    [COMPANY_ID],
  );
  console.log(`\nInserted ${String(customersInserted)} customer rows, ${String(groundTruthInserted)} ground-truth rows.`);
  console.log("Verification (live query, not the insert count):", verify.rows[0]);
  console.log("Ground truth verification:", gtVerify.rows[0]);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
