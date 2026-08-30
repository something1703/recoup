import { useState } from "react";

/**
 * A sibling panel above <TrueForgeUI> (same proven pattern as IncidentBanner
 * / RecoveryStatCard) — NOT a slot override. An earlier attempt overrode the
 * WelcomeScreen slot to inject these cards directly into the SDK's own
 * layout; without a way to visually verify the change, it broke the SDK's
 * internal composer/message-list sizing badly enough that the input became
 * unusable. Living outside the SDK's tree entirely means this can never
 * interfere with its layout, at the cost of one extra click (copy, then
 * paste) instead of a single click filling the composer directly.
 */
const DESKS = [
  {
    id: "arcline",
    label: "Failed-payment spike",
    tenantLabel: "Arcline Software",
    prompt:
      "Investigate the recent failed-payment spike for comp_arcline_software. Classify root cause and propose next steps.",
  },
  {
    id: "ferro",
    label: "Refund wave",
    tenantLabel: "Ferro Commerce",
    prompt:
      "Look into refund activity for comp_ferro_commerce. Separate serial abuse from a product-failure wave and quantify the impact.",
  },
  {
    id: "meridian",
    label: "Account-health review",
    tenantLabel: "Meridian Telecom",
    prompt:
      "Run an account-health review for comp_meridian_telecom. Discover a shortlist yourself and classify renewal risk for that batch.",
  },
] as const;

export function DeskPrompts() {
  const [status, setStatus] = useState<{ id: string; kind: "copied" | "failed" } | null>(null);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ id, kind: "copied" });
    } catch {
      // Clipboard permission denied or unavailable — was previously a silent
      // no-op with no visible signal at all; the prompt text is still
      // selectable manually (title attribute), but say so instead of nothing.
      setStatus({ id, kind: "failed" });
    }
    setTimeout(() => setStatus((current) => (current?.id === id ? null : current)), 1800);
  }

  return (
    <div className="recoup-desk-prompts">
      <span className="recoup-desk-prompts__label">START AN INVESTIGATION — copy a prompt into the chat below:</span>
      <div className="recoup-desk-prompts__row">
        {DESKS.map((desk) => (
          <button
            key={desk.id}
            type="button"
            className="recoup-desk-prompts__chip"
            onClick={() => void copy(desk.id, desk.prompt)}
            title={desk.prompt}
          >
            <span className="recoup-desk-prompts__chip-label">{desk.label}</span>
            <span className="recoup-desk-prompts__chip-tenant">{desk.tenantLabel}</span>
            <span className="recoup-desk-prompts__chip-action">
              {status?.id === desk.id ? (status.kind === "copied" ? "Copied ✓" : "Couldn't copy — select the text above") : "Copy prompt"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
