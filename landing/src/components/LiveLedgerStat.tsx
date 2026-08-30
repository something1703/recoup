import { useEffect, useState } from "react";

const RECOUP_ACTIONS_BASE_URL = "https://recoup-actions-377323041120.asia-northeast1.run.app";

type Stats = { total_recovered_usd: number; tickets_opened: number; actions_count: number };

// Pulls the actual live ledger — the same endpoint the cockpit's own stat card
// reads — so this number is real, not a hardcoded marketing figure.
export default function LiveLedgerStat() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${RECOUP_ACTIONS_BASE_URL}/stats`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Stats) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  return (
    <div className="border border-paper/30 bg-evidence/60 px-5 py-4 font-type inline-flex flex-col gap-1 min-w-[220px]">
      <span className="text-[10px] tracking-[0.25em] text-paper/60">LIVE LEDGER — recoup-actions /stats</span>
      <span className="text-2xl md:text-3xl font-bold text-paper tabular-nums">
        {stats ? `$${stats.total_recovered_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "$ — . —"}
      </span>
      <span className="text-[11px] text-paper/60">
        {stats
          ? stats.total_recovered_usd === 0
            ? "$0.00 is correct — DRY_RUN is on by default, so no live number is inflated by a rehearsal"
            : `${stats.actions_count} recorded actions · ${stats.tickets_opened} tickets filed`
          : "connecting to the real ledger…"}
      </span>
    </div>
  );
}
