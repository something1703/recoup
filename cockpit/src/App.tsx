import { useState } from "react";
import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import { IncidentBanner } from "./IncidentBanner";
import { RecoupToolCallCard } from "./RecoupToolCallCard";
import { RecoupSubAgentCard } from "./RecoupSubAgentCard";
import { RecoveryStatCard } from "./RecoveryStatCard";
import { DeskPrompts } from "./DeskPrompts";
import { RecoupBrandLogo } from "./RecoupBrandLogo";

// Local-mode default per docs/quickstart.mdx. Override with VITE_TRUEFORGE_BASE_URL
// when pointed at a hosted-mode deployment (http://localhost:8791) or a real domain.
const TRUEFORGE_BASE_URL = import.meta.env.VITE_TRUEFORGE_BASE_URL ?? "http://localhost:8790";

// A session created outside the cockpit's own composer (patrol-dunning.ts's
// pager, or any direct API call) has no other way to become visible here —
// confirmed live: the cockpit never lists or resumes any session, even ones
// created through its own composer, after a reload. TrueForgeUIProps exposes
// initialSessionId for exactly this; wiring it to a URL param at least makes
// a specific session openable via a link, which patrol-dunning.ts now prints.
const SESSION_ID_FROM_URL = new URLSearchParams(window.location.search).get("session") ?? undefined;

export default function App() {
  // The only user-facing surface for TrueForgeUI's own runtime errors (a
  // failed fetch mid-turn, a malformed stream) — previously this callback
  // only console.error'd, so a backend hiccup made the composer look frozen
  // with zero explanation. Reuses IncidentBanner's own error styling rather
  // than inventing a second error-banner language.
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  return (
    // <TrueForgeUI> has no `children` slot (it owns its whole subtree), so
    // Phase 9.6/9.7's independent status header sits as a sibling above it in
    // a flex column, rather than inside it as a slot override — see
    // IncidentBanner.tsx's comment on why that's the correct call here.
    <div className="h-full min-h-0 flex flex-col">
      {runtimeError && (
        <div className="recoup-incident-banner recoup-incident-banner--error" role="alert">
          ⚠️ {runtimeError}{" "}
          <button type="button" onClick={() => setRuntimeError(null)} className="recoup-incident-banner__dismiss">
            Dismiss
          </button>
        </div>
      )}
      <IncidentBanner />
      <RecoveryStatCard />
      <DeskPrompts />
      <TrueForgeUI
        server={{ type: "trueforge", baseUrl: TRUEFORGE_BASE_URL }}
        layout="sidebar"
        // Pin the cockpit to the one saved agent — this is a single-purpose product,
        // not a general agent browser, so hide the library/composer surfaces.
        agentConfig={{ mode: "SingleAgent", name: "recoup" }}
        theme={{
          preset: "trueforge",
          brand: { name: "Recoup", logo: { src: "/recoup-logo.svg" } },
          // The 4-token version only reached the primary button and success
          // pills — every other surface (sidebar, message bubbles, cards,
          // composer) was still running the stock "trueforge" preset colors.
          // Full ink/paper/stamp-red palette, matching landing/src/index.css.
          //
          // sidebarBg/topbarBg deliberately stay light (a docket-tan, not the
          // dark "evidence room" ink used on the landing hero): this SDK
          // version has exactly one ghostButtonText/textPrimary pair shared
          // by every surface, not a separate token for icons on dark chrome.
          // Verified live — a near-black sidebarBg rendered every icon button
          // (New Chat, Chat History, collapse, clear chat) invisible, same
          // color as its own background. Tan-on-ink keeps full contrast
          // without inventing an unsupported per-surface text override.
          tokens: {
            fontFamily: '"Courier Prime", ui-monospace, monospace',
            sidebarBg: "#e4dcc4",
            topbarBg: "#e4dcc4",
            primaryBg: "#f4f2ec",
            secondaryBg: "#ece8dc",
            border: "#d9c9a3",
            inputBoxBg: "#fbf9f3",
            inputBorder: "#d9c9a3",
            textPrimary: "#16130f",
            textSecondary: "#5c5648",
            cardBg: "#fbf9f3",
            dropdownSelectedItemBg: "#f4e6d8",
            dropdownSelectedItemText: "#16130f",
            userMessageBg: "#16130f",
            userMessageText: "#f4f2ec",
            // inputBoxBg/cardBg/assistantMessageBg were pure #ffffff — cooler
            // than the warm cream used everywhere else, so bubbles and tool
            // cards read as a different "paper stock" than the rest of the app.
            assistantMessageBg: "#fbf9f3",
            assistantMessageText: "#16130f",
            primaryButtonBg: "#c1272d",
            primaryButtonHover: "#a02024",
            primaryButtonText: "#f4f2ec",
            secondaryButtonBg: "#ece8dc",
            secondaryButtonHover: "#d9c9a3",
            secondaryButtonText: "#16130f",
            ghostButtonBg: "transparent",
            ghostButtonHover: "#ece8dc",
            ghostButtonText: "#16130f",
            successBg: "#e6f4ea",
            successText: "#0f6b3f",
            failureBg: "#fbe4e4",
            failureText: "#a02024",
            warningBg: "#fdf1de",
            warningText: "#8a5a12",
            focusRing: "#1e3a5f",
            radius: "2px",
            composerRadius: "4px",
            overlay: "rgba(22, 19, 15, 0.45)",
            shadowColor: "rgba(22, 19, 15, 0.25)",
            scrollbarThumb: "#d9c9a3",
          },
        }}
        overrides={{ ToolCallCard: RecoupToolCallCard, SubAgentCard: RecoupSubAgentCard, BrandLogo: RecoupBrandLogo }}
        initialSessionId={SESSION_ID_FROM_URL}
        className="flex-1 min-h-0"
        onError={(error) => {
          console.error("Recoup Cockpit runtime error:", error);
          setRuntimeError(error instanceof Error ? error.message : "Something went wrong talking to the agent — try again.");
        }}
      />
    </div>
  );
}
