import { useEffect, useState } from "react";

/**
 * Phase 9.6: a persistent header showing investigation status, independent of
 * the chat transcript.
 *
 * Deliberately plain fetch() against TrueForge's own REST API
 * (GET /api/v1/sessions, GET /api/v1/sessions/{id}/turns) rather than the SDK's
 * client — @truefoundry/trueforge-ui@0.2.4's useServer() is only reachable from
 * inside <TrueForgeUI>'s own subtree (it has no `children` slot to render this
 * alongside), and the standalone createTrueFoundryAgentUIServer() factory
 * turns out to be for TrueFoundry's separate hosted gateway product (needs an
 * apiKey + Control Plane URL) — not this self-hosted deployment. The raw REST
 * shape here (snake_case, no auth — OIDC isn't configured) is the same one
 * used directly and verified repeatedly throughout this project's build.
 */
type TurnState =
  | { status: "running" }
  | { status: "done" }
  | { status: "cancelled"; reason: string }
  | { status: "error"; message: string };

type BannerState = { kind: "idle" } | ({ kind: TurnState["status"] } & Omit<TurnState, "status">);

const TRUEFORGE_BASE_URL = import.meta.env.VITE_TRUEFORGE_BASE_URL ?? "http://localhost:8790";
const POLL_INTERVAL_MS = 5000;

export function IncidentBanner() {
  const [state, setState] = useState<BannerState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const sessionsRes = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions?limit=1&order=desc`);
        if (!sessionsRes.ok) return;
        const sessionsJson = (await sessionsRes.json()) as { data: Array<{ id: string }> };
        const latestSession = sessionsJson.data[0];
        if (!latestSession) {
          if (!cancelled) setState({ kind: "idle" });
          return;
        }

        // The route's own description claims "newest first by default" — checked
        // against the live instance and that's not what happens: turns come back
        // oldest-first, and there's no `order` param to request otherwise (only
        // limit/page_token). Fetch a generous page and take the last element.
        const turnsRes = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${latestSession.id}/turns?limit=100`);
        if (!turnsRes.ok) return;
        const turnsJson = (await turnsRes.json()) as { data: Array<{ state: TurnState }> };
        const latestTurn = turnsJson.data[turnsJson.data.length - 1];
        if (cancelled) return;
        if (!latestTurn) {
          setState({ kind: "idle" });
          return;
        }
        setState({ kind: latestTurn.state.status, ...latestTurn.state } as BannerState);
      } catch {
        // Transient — a failed poll shouldn't flip the banner to an error
        // state; just try again next tick.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (state.kind === "idle") return null;

  const copy: Record<BannerState["kind"], string> = {
    idle: "",
    running: "🔎 Investigating a payment-failure incident…",
    done: "✅ Investigation complete — see the report below.",
    cancelled: `⚠️ Investigation stopped: ${"reason" in state ? state.reason : "unknown reason"}`,
    error: `⚠️ Investigation hit an error: ${"message" in state ? state.message : "unknown error"}`,
  };

  return (
    <div className={`recoup-incident-banner recoup-incident-banner--${state.kind}`} role="status">
      {copy[state.kind]}
    </div>
  );
}
