// A faithful recreation of the actual gold approval card
// (cockpit/src/RecoupToolCallCard.tsx) — labeled as a recreation, not a
// screenshot, because a claim that can't be checked isn't evidence.
export default function ApprovalCardExhibit() {
  return (
    <div className="border-2 border-[#b8860b] rounded-xl overflow-hidden max-w-md bg-white shadow-[0_0_0_3px_rgba(184,134,11,0.12)]">
      <div className="bg-gradient-to-r from-[#fff7e6] to-[#fdeecb] text-[#7a5200] font-bold text-sm px-4 py-2 border-b border-[#e9c46a]">
        Human approval required
      </div>
      <div className="p-4 font-type text-ink">
        <div className="text-xs font-bold tracking-wider text-notary mb-2">retry_eligible_charges</div>
        <div className="text-sm mb-3">
          2 charges, $1,240.00 total — insufficient_funds, safe to retry per
          policy. Kestrel Studio excluded (never_retry: stolen_card).
        </div>
        <div className="flex gap-3">
          <span className="bg-stamp text-paper text-xs font-bold px-4 py-2">ALLOW</span>
          <span className="border border-ink/30 text-xs font-bold px-4 py-2">DENY</span>
        </div>
      </div>
    </div>
  );
}
