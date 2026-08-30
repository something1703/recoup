/**
 * The pager. Watches a tenant's failed-charge count against a threshold and,
 * on breach, opens a Recoup investigation session on TrueForge WITH NO HUMAN
 * PROMPT — the agent starts itself, exactly the way an SRE gets paged by an
 * alert rather than remembering to go look at a dashboard.
 *
 * Everything downstream is unchanged and fully harness-run: the same skill,
 * the same sub-agent fan-out, the same sandbox math, and — critically — the
 * same human approval gates. Self-TRIGGERED is not self-APPROVED: the session
 * this opens still stops dead at retry_eligible_charges / open_recovery_ticket
 * until a person clicks Allow in the cockpit. The trigger removes the human
 * from the *noticing*, never from the *deciding*.
 *
 * Usage:
 *   # real check against Stripe test mode (needs a sk_test_ key):
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/patrol-dunning.ts \
 *     [--company-id comp_arcline_software] [--threshold 10] [--window-hours 24] [--watch]
 *
 *   # rehearsal: skip the Stripe read and fire the investigation immediately:
 *   npx tsx scripts/patrol-dunning.ts --simulate
 *
 * --watch polls every 60s until breach (one investigation per run, not one
 * per poll). TRUEFORGE_BASE_URL overrides the default deployed instance.
 */

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "https://trueforge-377323041120.asia-northeast1.run.app";
const COCKPIT_URL = "https://recoup-cockpit-377323041120.asia-northeast1.run.app";
const AGENT_NAME = "recoup";

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const COMPANY_ID = arg("--company-id", "comp_arcline_software");
const THRESHOLD = Number(arg("--threshold", "10"));
const WINDOW_HOURS = Number(arg("--window-hours", "24"));
const SIMULATE = process.argv.includes("--simulate");
const WATCH = process.argv.includes("--watch");

// Same guard as mcp-server: this script only ever reads, but a live key here
// is still a config mistake worth refusing loudly.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!SIMULATE && !STRIPE_SECRET_KEY) {
  throw new Error("Set STRIPE_SECRET_KEY (sk_test_...) for a real patrol, or pass --simulate to fire without one.");
}
if (STRIPE_SECRET_KEY && !STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error("STRIPE_SECRET_KEY is not a test-mode key (must start with sk_test_) — refusing.");
}

async function countRecentFailedCharges(): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - WINDOW_HOURS * 3600;
  const params = new URLSearchParams({
    query: `status:"failed" AND created>${String(since)}`,
    limit: "100",
  });
  const response = await fetch(`https://api.stripe.com/v1/charges/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY!}` },
  });
  if (!response.ok) {
    throw new Error(`Stripe charge search failed (${String(response.status)}): ${await response.text()}`);
  }
  const json = (await response.json()) as { data: unknown[]; has_more: boolean };
  // 100+ in-window failures is "breach" regardless of the exact count — the
  // investigation itself does the precise sizing, not the pager.
  return json.has_more ? json.data.length + 1 : json.data.length;
}

async function openInvestigation(failedCount: number | "simulated"): Promise<void> {
  const sessionResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: { name: AGENT_NAME } }),
  });
  if (!sessionResponse.ok) {
    throw new Error(`Session create failed (${String(sessionResponse.status)}): ${await sessionResponse.text()}`);
  }
  const session = (await sessionResponse.json()) as { data: { id: string } };
  const sessionId = session.data.id;

  const prompt =
    `AUTOMATED ALERT (patrol-dunning.ts, no human involved yet): ${COMPANY_ID} logged ` +
    (failedCount === "simulated" ? `a failed-charge threshold breach (simulated for rehearsal)` : `${String(failedCount)} failed charges in the last ${String(WINDOW_HOURS)}h, over the ${String(THRESHOLD)}-failure patrol threshold`) +
    `. Run the dunning-playbook investigation for ${COMPANY_ID}: triage, classify root cause, quantify the $ at risk in the sandbox, ` +
    `and propose actions. A human will review your proposal in the cockpit — do not assume anyone has seen this alert yet, so make the ` +
    `opening summary self-contained.`;

  // Turn creation streams SSE; the patrol doesn't wait for the investigation
  // to finish — its job ends the moment the page lands. Read a first chunk to
  // confirm the turn actually started, then hang up.
  const turnResponse = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Discriminated-union input, verified against the live API: a bare
    // {"message": ...} is accepted but produces an EMPTY prompt (the turn
    // errors with "messages must not be empty") — user.message items are the
    // real shape.
    body: JSON.stringify({ input: [{ type: "user.message", content: prompt }] }),
  });
  if (!turnResponse.ok || !turnResponse.body) {
    throw new Error(`Turn create failed (${String(turnResponse.status)}): ${await turnResponse.text()}`);
  }
  const reader = turnResponse.body.getReader();
  const first = await reader.read();
  const firstChunk = first.value ? new TextDecoder().decode(first.value) : "";
  await reader.cancel();
  if (!firstChunk.includes("turn.created")) {
    throw new Error(`Turn did not confirm start — first event was: ${firstChunk.slice(0, 200)}`);
  }

  console.log(`PAGED: investigation session ${sessionId} opened for ${COMPANY_ID} with no human prompt.`);
  // The cockpit has no session list/history of its own (verified: it never
  // resumes any session, even ones it created itself, after a reload) — a
  // session created outside its composer is otherwise unreachable. This
  // direct link is the only way to actually watch this one.
  console.log(`Watch it (and approve or deny whatever it proposes): ${COCKPIT_URL}/?session=${sessionId}`);
}

async function main(): Promise<void> {
  if (SIMULATE) {
    console.log(`--simulate: skipping the Stripe read and paging immediately.`);
    await openInvestigation("simulated");
    return;
  }
  for (;;) {
    const failed = await countRecentFailedCharges();
    console.log(`${new Date().toISOString()} patrol: ${String(failed)} failed charge(s) in last ${String(WINDOW_HOURS)}h (threshold ${String(THRESHOLD)})`);
    if (failed >= THRESHOLD) {
      await openInvestigation(failed);
      return;
    }
    if (!WATCH) {
      console.log("No breach; exiting. Pass --watch to keep patrolling.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
