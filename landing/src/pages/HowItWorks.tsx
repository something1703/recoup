import Nav from "../components/Nav";
import DocketBar from "../components/DocketBar";
import Footer from "../components/Footer";
import CorkboardDiagram from "../components/diagrams/CorkboardDiagram";
import VerdictTreeDiagram from "../components/diagrams/VerdictTreeDiagram";
import EvalMethodDiagram from "../components/diagrams/EvalMethodDiagram";

export default function HowItWorks() {
  return (
    <div>
      <header className="bg-evidence text-paper">
        <DocketBar dark />
        <Nav dark />
        <div className="case-file py-14 md:py-20">
          <div className="text-xs font-bold tracking-[0.3em] text-stamp mb-4">THE FULL CASE FILE</div>
          <h1 className="font-stamp text-3xl md:text-5xl max-w-3xl">How the investigation actually runs.</h1>
          <p className="mt-4 max-w-2xl text-paper/80 leading-relaxed">
            No hidden steps. This is the same sequence that runs live inside
            the cockpit, drawn from the real skill files that govern it.
          </p>
        </div>
      </header>

      <section className="case-file py-16 md:py-24">
        <div className="text-xs font-bold tracking-[0.3em] text-notary mb-3">STAGE 1 — CORRELATE</div>
        <h2 className="font-stamp text-2xl md:text-3xl mb-6 max-w-2xl">
          Four sources, pulled in parallel, not read one at a time.
        </h2>
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <p className="leading-relaxed text-ink/85">
            A root agent delegates each source to its own sub-agent: Stripe's
            decline codes and amounts, Supabase's customer LTV tier, Sentry's
            error timing, GitHub's deploy history. Their findings merge back
            into one picture before anything is classified — this is the
            actual harness doing real parallel sub-agent work, not a
            simulated multi-step wizard.
          </p>
          <CorkboardDiagram />
        </div>
      </section>

      <section className="bg-paper-dim py-16 md:py-24">
        <div className="case-file">
          <div className="text-xs font-bold tracking-[0.3em] text-notary mb-3">STAGE 2 — CLASSIFY</div>
          <h2 className="font-stamp text-2xl md:text-3xl mb-6 max-w-2xl">
            The verdict decides the tool. Never the other way around.
          </h2>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <VerdictTreeDiagram />
            <p className="leading-relaxed text-ink/85">
              A decline that clusters with no matching deploy or error looks
              like an ordinary card problem — safe to retry, if the customer's
              LTV tier doesn't force human escalation regardless of amount. A
              decline that lines up with a release or a fresh error is a bug —
              retrying against it just burns the customer's retry budget on a
              charge that will fail again. The classification in{" "}
              <code className="redline">skills/dunning-playbook/SKILL.md</code>{" "}
              decides which gated tool gets proposed, if either does.
            </p>
          </div>
        </div>
      </section>

      <section className="case-file py-16 md:py-24">
        <div className="text-xs font-bold tracking-[0.3em] text-notary mb-3">STAGE 3 — QUANTIFY</div>
        <h2 className="font-stamp text-2xl md:text-3xl mb-6 max-w-2xl">
          Every dollar figure comes out of executed code.
        </h2>
        <p className="max-w-2xl leading-relaxed text-ink/85">
          Before proposing anything, the agent writes and runs a short Python
          script in a real sandbox — joining the affected charges against LTV
          tiers, grouping by decline code, summing what's safe to retry versus
          what needs a human decision. The number in the final report is
          whatever that script printed. Nothing is typed in by the model, and
          nothing is eyeballed from raw JSON.
        </p>
      </section>

      <section className="bg-evidence text-paper py-16 md:py-24">
        <div className="case-file">
          <div className="text-xs font-bold tracking-[0.3em] text-stamp mb-3">STAGE 4 — APPROVE</div>
          <h2 className="font-stamp text-2xl md:text-3xl mb-6 max-w-2xl">
            Two gated tools exist. Both wait for a human, always.
          </h2>
          <p className="max-w-2xl leading-relaxed text-paper/85">
            <code className="text-stamp">retry_eligible_charges</code> and{" "}
            <code className="text-stamp">open_recovery_ticket</code> are the
            only write actions in the entire system. Both are annotated
            destructive/write and named explicitly in the agent's
            approval-required list — belt and suspenders. Neither ever fires
            without a human clicking Allow in the cockpit. There is no
            confidence threshold that skips this step.
          </p>
        </div>
      </section>

      <section className="case-file py-16 md:py-24">
        <div className="text-xs font-bold tracking-[0.3em] text-notary mb-3">EXHIBIT F — THE EVALUATION</div>
        <h2 className="font-stamp text-2xl md:text-3xl mb-6 max-w-2xl">
          The account-health desk is scored, not just demonstrated.
        </h2>
        <div className="mb-8">
          <EvalMethodDiagram />
        </div>
        <p className="max-w-2xl leading-relaxed text-ink/85">
          For the real-data tenant, the agent never sees the outcome it's
          being judged against — <code className="redline">customer_churn_ground_truth</code>{" "}
          is a table no agent-facing database role can read. A separate,
          offline script (zero model calls) checks the agent's real
          classifications against that real outcome and reports precision and
          recall. This is a young, low-volume result today — the honest
          number, not a rounded-up one, is what the script prints when you run
          it yourself.
        </p>
      </section>

      <Footer />
    </div>
  );
}
