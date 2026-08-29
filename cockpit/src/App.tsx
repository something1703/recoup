import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import { IncidentBanner } from "./IncidentBanner";
import { RecoupToolCallCard } from "./RecoupToolCallCard";
import { RecoveryStatCard } from "./RecoveryStatCard";

// Local-mode default per docs/quickstart.mdx. Override with VITE_TRUEFORGE_BASE_URL
// when pointed at a hosted-mode deployment (http://localhost:8791) or a real domain.
const TRUEFORGE_BASE_URL = import.meta.env.VITE_TRUEFORGE_BASE_URL ?? "http://localhost:8790";

export default function App() {
  return (
    // <TrueForgeUI> has no `children` slot (it owns its whole subtree), so
    // Phase 9.6/9.7's independent status header sits as a sibling above it in
    // a flex column, rather than inside it as a slot override — see
    // IncidentBanner.tsx's comment on why that's the correct call here.
    <div className="h-full min-h-0 flex flex-col">
      <IncidentBanner />
      <RecoveryStatCard />
      <TrueForgeUI
        server={{ type: "trueforge", baseUrl: TRUEFORGE_BASE_URL }}
        layout="sidebar"
        // Pin the cockpit to the one saved agent — this is a single-purpose product,
        // not a general agent browser, so hide the library/composer surfaces.
        agentConfig={{ mode: "SingleAgent", name: "recoup" }}
        theme={{
          preset: "trueforge",
          // The published @truefoundry/trueforge-ui@0.2.4 BrandConfig is just
          // { name, logo? } — no `mode`/`icon`/`href` yet (the docs in the repo
          // describe a newer shape; verified against the installed d.ts before
          // shipping this). Add `logo: "/your-logo.svg"` once you have one.
          brand: { name: "Recoup" },
          tokens: {
            primaryButtonBg: "#0f6b3f",
            primaryButtonHover: "#0c5733",
            successBg: "#e6f4ea",
            successText: "#0f6b3f",
          },
        }}
        overrides={{ ToolCallCard: RecoupToolCallCard }}
        className="flex-1 min-h-0"
        onError={(error) => console.error("Recoup Cockpit runtime error:", error)}
      />
    </div>
  );
}
