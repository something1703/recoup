export default function DocketBar({ dark = false }: { dark?: boolean }) {
  const border = dark ? "border-paper/25" : "border-ink/25";
  const text = dark ? "text-paper/70" : "text-ink/70";
  return (
    <div className={`case-file flex items-center justify-between gap-3 border-b ${border} py-3 text-[10px] md:text-xs tracking-widest whitespace-nowrap overflow-x-auto ${text}`}>
      <span>CASE NO. RCP-2026-001</span>
      <span className="hidden sm:inline">IN THE MATTER OF: YOUR REVENUE</span>
      <span>FILED 2026-08-30</span>
    </div>
  );
}
