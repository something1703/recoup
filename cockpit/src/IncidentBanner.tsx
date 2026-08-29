import { useEffect, useRef, useState } from "react";

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

// Turns come back oldest-first (checked live, despite the route's own docs claiming otherwise) — walks every page to find the true latest, not just the first page's last element.
async function fetchLatestTurn(sessionId: string): Promise<{ state: TurnState } | undefined> {
  let pageToken: string | undefined;
  let lastPage: Array<{ state: TurnState }> = [];
  for (;;) {
    const url = new URL(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${sessionId}/turns`);
    url.searchParams.set("limit", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const res = await fetch(url);
    // A failure mid-traversal must not silently resolve to whatever page loaded
    // last — that could be an older page, reporting a stale status as current.
    // Throw so the caller keeps its existing state instead of regressing it.
    if (!res.ok) throw new Error(`GET /sessions/${sessionId}/turns failed: ${String(res.status)}`);
    const json = (await res.json()) as { data: Array<{ state: TurnState }>; pagination?: { next_page_token?: string } };
    lastPage = json.data;
    if (!json.pagination?.next_page_token) break;
    pageToken = json.pagination.next_page_token;
  }
  return lastPage[lastPage.length - 1];
}

// Renders nothing until a session actually exists — this is a status overlay, not a fixture of the layout.
export function IncidentBanner() {
  const [state, setState] = useState<BannerState>({ kind: "idle" });
  // Guards against a slower, older poll completing after a newer one and
  // overwriting the banner with a stale status (setInterval ticks don't wait
  // for the previous fetch to finish, so out-of-order completion is real).
  const pollGeneration = useRef(0);

  useEffect(() => {
    // Finds the most recent session's latest turn and maps its status onto the banner.
    async function poll() {
      const generation = ++pollGeneration.current;
      try {
        const sessionsRes = await fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions?limit=1&order=desc`);
        if (!sessionsRes.ok) return;
        const sessionsJson = (await sessionsRes.json()) as { data: Array<{ id: string }> };
        const latestSession = sessionsJson.data[0];
        if (!latestSession) {
          if (generation === pollGeneration.current) setState({ kind: "idle" });
          return;
        }

        const latestTurn = await fetchLatestTurn(latestSession.id);
        if (generation !== pollGeneration.current) return; // a newer poll already landed
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
    return () => clearInterval(interval);
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
