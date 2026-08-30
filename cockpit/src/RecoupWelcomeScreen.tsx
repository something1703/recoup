/**
 * Overrides trueforge-ui's default WelcomeScreen slot entirely (see App.tsx's
 * `overrides`). WelcomeScreenProps only exposes heading/icon/className — no
 * way to inject real content — so this ignores those props and renders our
 * own briefing screen instead: what Recoup is, which tenant to investigate,
 * and one real prompt per desk to start from.
 */
const DESKS = [
  {
    id: "arcline",
    label: "Failed-payment spike",
    tenant: "comp_arcline_software",
    tenantLabel: "Arcline Software (B2B SaaS)",
    prompt:
      "Investigate the recent failed-payment spike for comp_arcline_software. Classify root cause and propose next steps.",
  },
  {
    id: "ferro",
    label: "Refund wave",
    tenant: "comp_ferro_commerce",
    tenantLabel: "Ferro Commerce (subscription retail)",
    prompt:
      "Look into refund activity for comp_ferro_commerce. Separate serial abuse from a product-failure wave and quantify the impact.",
  },
  {
    id: "meridian",
    label: "Account-health review",
    tenant: "comp_meridian_telecom",
    tenantLabel: "Meridian Telecom — 7,043 real subscribers",
    prompt:
      "Run an account-health review for comp_meridian_telecom. Discover a shortlist yourself and classify renewal risk for that batch.",
  },
] as const;

// Sets the native composer's value and fires the events React listens for —
// there is no exposed API to prefill or send a draft message, so this drives
// the same textarea a person would type into, rather than bypassing it.
function fillComposer(text: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

export function RecoupWelcomeScreen() {
  return (
    <div className="recoup-welcome">
      <div className="recoup-welcome__mark" aria-hidden="true">
        $
      </div>
      <h1 className="recoup-welcome__heading">Start an investigation</h1>
      <p className="recoup-welcome__sub">
        Recoup investigates a revenue incident the way an SRE investigates an outage — four sources correlated,
        dollar impact computed in executed code, a human approves before anything real happens.
        <br />
        <strong>Nothing retries a charge or files a ticket without your Allow.</strong>
      </p>
      <div className="recoup-welcome__grid">
        {DESKS.map((desk) => (
          <button key={desk.id} type="button" className="recoup-desk-card" onClick={() => fillComposer(desk.prompt)}>
            <span className="recoup-desk-card__label">{desk.label}</span>
            <span className="recoup-desk-card__tenant">{desk.tenantLabel}</span>
            <span className="recoup-desk-card__prompt">&ldquo;{desk.prompt}&rdquo;</span>
            <span className="recoup-desk-card__cta">USE THIS PROMPT →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
