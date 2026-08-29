import { useEffect, useRef, useState } from "react";

/**
 * Phase 9.7: cumulative $ recovered, read from recoup-actions' /stats endpoint
 * (mcp-server/src/index.ts) — an aggregate-only, unauthenticated, CORS-open
 * route built specifically for this: the cockpit calls it directly from the
 * browser, so it must never carry the MCP bearer token or any row-level detail.
 *
 * Ticks up once per value change, not continuously — docs/UI_UX_SPEC.md is
 * explicit that the cockpit is a restrained surface and this is the one
 * micro-interaction it allows here. Respects prefers-reduced-motion.
 */
const RECOUP_ACTIONS_BASE_URL = import.meta.env.VITE_RECOUP_ACTIONS_BASE_URL ?? "http://localhost:8890";
const POLL_INTERVAL_MS = 20000;
const TICK_DURATION_MS = 800;

type Stats = { total_recovered_usd: number; tickets_opened: number; actions_count: number };

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Tweens the displayed number toward `target` once per change instead of snapping, unless the viewer prefers reduced motion.
function useAnimatedValue(target: number): number {
  const [displayed, setDisplayed] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || target === fromRef.current) {
      setDisplayed(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame: number;

    // One requestAnimationFrame tick of the tween from `from` toward `target`.
    function step(now: number) {
      const progress = Math.min((now - start) / TICK_DURATION_MS, 1);
      setDisplayed(from + (target - from) * progress);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return displayed;
}

// Renders nothing until the first successful /stats fetch — no placeholder $0 flash on load.
export function RecoveryStatCard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const res = await fetch(`${RECOUP_ACTIONS_BASE_URL}/stats`);
        if (!res.ok) return;
        const data = (await res.json()) as Stats;
        if (!cancelled) setStats(data);
      } catch {
        // Transient network/cold-start hiccup — keep showing the last good value.
      }
    }
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const animatedTotal = useAnimatedValue(stats?.total_recovered_usd ?? 0);

  if (!stats) return null;

  return (
    <div className="recoup-stat-card" data-testid="recoup-recovery-stat">
      <span className="recoup-stat-card__value">{currencyFormatter.format(animatedTotal)}</span>
      <span className="recoup-stat-card__label">
        recovered · {stats.tickets_opened} ticket{stats.tickets_opened === 1 ? "" : "s"} opened
      </span>
    </div>
  );
}
