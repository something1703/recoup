import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import DocketBar from "../components/DocketBar";
import Exhibit from "../components/Exhibit";
import Footer from "../components/Footer";
import LiveLedgerStat from "../components/LiveLedgerStat";
import ApprovalCardExhibit from "../components/ApprovalCardExhibit";

const COCKPIT_URL = "https://recoup-cockpit-377323041120.asia-northeast1.run.app";

export default function Home() {
  return (
    <div>
      {/* Hero — evidence room */}
      <header className="bg-evidence text-paper">
        <DocketBar dark />
        <Nav dark />
        <div className="case-file py-20 md:py-28">
          <div className="stamp stamp-animate text-stamp text-3xl md:text-5xl mb-8 inline-block">
            Exhibit A
          </div>
          <h1 className="font-stamp text-4xl md:text-7xl leading-[1.05] max-w-4xl">
            Your revenue has an incident.
            <br />
            Nobody filed a report.
          </h1>
          <p className="mt-6 max-w-2xl text-lg md:text-xl font-bold text-paper">
            Recoup is an AI agent that investigates failed payments, refund
            abuse, and churn risk — and never touches a charge or files a
            ticket without your sign-off.
          </p>
          <p className="mt-4 max-w-2xl text-base md:text-lg text-paper/85 leading-relaxed">
            It works the way an SRE investigates an outage — four independent
            sources correlated, evidence computed in executed code, a human
            signs off before anything real happens. Every claim below is a
            numbered exhibit. Check any of them yourself.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href={COCKPIT_URL}
              className="bg-stamp text-paper font-bold tracking-wider text-sm px-6 py-3 hover:bg-stamp/90 active:translate-y-px transition-all"
            >
              OPEN THE LIVE COCKPIT →
            </a>
            <Link
              to="/how-it-works"
              className="border border-paper/40 font-bold tracking-wider text-sm px-6 py-3 hover:border-paper transition-colors"
            >
              HOW THE INVESTIGATION WORKS
            </Link>
          </div>
          <div className="mt-10">
            <LiveLedgerStat />
          </div>
        </div>
      </header>

      {/* The Complaint */}
      <section className="case-file py-16 md:py-24 grid md:grid-cols-[1fr_260px] gap-10 items-start">
        <div>
          <div className="text-xs font-bold tracking-[0.3em] text-notary mb-4">THE COMPLAINT</div>
          <h2 className="font-stamp text-2xl md:text-4xl mb-6 max-w-3xl">
            Most "churn" was never a decision.
          </h2>
          <p className="max-w-2xl leading-relaxed text-ink/85">
            A meaningful share of subscription churn is <span className="redline">involuntary</span> —
            an expired card, a bank decline, a webhook that broke silently
            after a deploy. Today it's handled by a blanket retry schedule, or
            by someone manually digging through a payments dashboard.
            Engineering solved this exact problem for uptime decades ago:
            investigate, correlate, classify, quantify, act, write it up.
            Recoup applies that discipline to revenue instead.
          </p>
        </div>
        <div className="border-2 border-ink bg-paper p-5 font-type -rotate-1">
          <div className="text-[10px] tracking-[0.2em] text-ink/60 mb-2">EXHIBIT — SOURCE DATA</div>
          <div className="text-4xl font-bold tabular-nums text-stamp">26.5%</div>
          <div className="text-xs text-ink/75 mt-2 leading-snug">
            of the 7,043 real subscribers behind this page's own account-health
            evaluation actually churned — the real base rate, not an industry
            estimate.
          </div>
        </div>
      </section>

      {/* The Docket — three real tenant companies, three desks */}
      <section className="case-file py-16 md:py-24">
        <div className="text-xs font-bold tracking-[0.3em] text-notary mb-4">THE DOCKET</div>
        <h2 className="font-stamp text-2xl md:text-4xl mb-4 max-w-3xl">
          Revenue isn't one problem. It's a department.
        </h2>
        <p className="max-w-2xl leading-relaxed text-ink/85 mb-10">
          Recoup runs recovery for multiple real tenant companies, each with
          its own policy calibrated to its own revenue — not one global
          threshold pretending every business is the same size.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border border-ink/25 p-5 bg-paper-dim">
            <div className="text-[10px] tracking-[0.2em] text-notary mb-2">TENANT 01 · B2B SAAS</div>
            <div className="font-stamp text-lg mb-2">Arcline Software</div>
            <div className="text-sm text-ink/80">Failed-payment desk — card-level vs. platform-level, safe retry vs. human escalation.</div>
          </div>
          <div className="border border-ink/25 p-5 bg-paper-dim">
            <div className="text-[10px] tracking-[0.2em] text-notary mb-2">TENANT 02 · SUBSCRIPTION RETAIL</div>
            <div className="font-stamp text-lg mb-2">Ferro Commerce</div>
            <div className="text-sm text-ink/80">Refund-abuse desk — serial abuse vs. a product-failure wave, quantified before any ticket.</div>
          </div>
          <div className="border border-ink/25 p-5 bg-paper-dim">
            <div className="text-[10px] tracking-[0.2em] text-notary mb-2">TENANT 03 · CONSUMER TELECOM</div>
            <div className="font-stamp text-lg mb-2">Meridian Telecom</div>
            <div className="text-sm text-ink/80">Account-health desk — 7,043 real subscribers, scored against a real held-out outcome.</div>
          </div>
        </div>
      </section>

      {/* The Evidence — condensed 4-stage summary */}
      <section className="bg-paper-dim py-16 md:py-24">
        <div className="case-file">
          <div className="text-xs font-bold tracking-[0.3em] text-notary mb-4">THE EVIDENCE</div>
          <h2 className="font-stamp text-2xl md:text-4xl mb-10 max-w-3xl">
            Four exhibits, filed before anything is proposed.
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Exhibit letter="B" title="Investigate">
              Pull the real Stripe decline codes, real customer LTV tier, real
              Sentry error timing, real GitHub deploy history — in parallel,
              not one at a time.
            </Exhibit>
            <Exhibit letter="C" title="Classify">
              Card-level or platform-level? Serial refund abuse or a product
              bug? The wrong classification wastes a retry or files a useless
              ticket — so this happens before anything is proposed.
            </Exhibit>
            <Exhibit letter="D" title="Quantify">
              Every dollar figure is the output of executed code in a
              sandbox — never eyeballed from raw JSON, never typed by hand.
            </Exhibit>
            <Exhibit letter="E" title="Approve">
              Two gated actions exist in this entire system. Neither fires
              without a human clicking Allow. No exceptions, no confidence
              threshold that skips the human.
            </Exhibit>
          </div>
          <div className="mt-10">
            <ApprovalCardExhibit />
            <div className="text-[11px] text-ink/50 mt-2 max-w-md">
              Recreation of the real approval card (cockpit/src/RecoupToolCallCard.tsx) — not a screenshot, and not a real ledger entry. See it live in the cockpit.
            </div>
          </div>
          <Link
            to="/how-it-works"
            className="inline-block mt-8 font-bold text-sm tracking-wider text-notary hover:text-stamp transition-colors"
          >
            VIEW THE FULL CASE FILE →
          </Link>
        </div>
      </section>

      {/* The Verdict — real data proof */}
      <section className="case-file py-16 md:py-24">
        <div className="text-xs font-bold tracking-[0.3em] text-notary mb-4">EXHIBIT F — INDEPENDENT VERIFICATION</div>
        <h2 className="font-stamp text-2xl md:text-4xl mb-6 max-w-3xl">
          Scored against a real outcome. Not demonstrated on a scenario built to be solved.
        </h2>
        <p className="max-w-2xl leading-relaxed text-ink/85">
          One tenant Recoup runs recovery for is seeded from the real IBM
          Telco Customer Churn dataset — <span className="redline">7,043 real,
          anonymized subscribers</span> with a real recorded outcome. That
          outcome is held in a table no agent-facing database role can read.
          Recoup classifies renewal risk from the observable signals alone;
          a separate, offline script checks its calls against what actually
          happened. The methodology is public —{" "}
          <a
            href="https://github.com/something1703/recoup/blob/main/scripts/score-account-health-eval.ts"
            className="redline"
          >
            read the scoring script
          </a>{" "}
          — because a claim you can't check is not evidence.
        </p>
      </section>

      {/* Chain of Custody */}
      <section className="bg-evidence text-paper py-16 md:py-24">
        <div className="case-file">
          <div className="text-xs font-bold tracking-[0.3em] text-stamp mb-4">EXHIBIT G — CHAIN OF CUSTODY</div>
          <h2 className="font-stamp text-2xl md:text-4xl mb-10 max-w-3xl">
            Every change to this system is on the record too.
          </h2>
          <div className="grid md:grid-cols-3 gap-8 text-sm text-paper/85">
            <div>
              <div className="font-stamp text-lg mb-2 text-paper">Qodo-reviewed</div>
              Every pull request is reviewed before it merges. A human — never
              the agent — performs the merge.
            </div>
            <div>
              <div className="font-stamp text-lg mb-2 text-paper">DRY_RUN by default</div>
              Rehearsal runs never inflate a number a stakeholder reads as
              real recovered revenue.
            </div>
            <div>
              <div className="font-stamp text-lg mb-2 text-paper">Least-privilege, always</div>
              The agent's database role, the tool server's own role, and the
              evaluation role never overlap.
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="case-file py-20 md:py-28 text-center">
        <div className="stamp text-stamp text-2xl md:text-3xl inline-block mb-8">Case Open</div>
        <h2 className="font-stamp text-3xl md:text-5xl mb-8 max-w-2xl mx-auto">
          Your revenue's incident report is overdue.
        </h2>
        <a
          href="https://github.com/something1703/recoup"
          className="inline-block bg-stamp text-paper font-bold tracking-wider text-sm px-8 py-4 hover:bg-stamp/90 transition-colors"
        >
          OPEN THE REPOSITORY →
        </a>
      </section>

      <Footer />
    </div>
  );
}
