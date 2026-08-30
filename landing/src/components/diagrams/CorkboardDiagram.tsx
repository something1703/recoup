// A detective's corkboard: four evidence sources, red string running to one
// merged verdict. Literalizes "correlate," the actual mechanism, not an icon.
export default function CorkboardDiagram() {
  const nodes = [
    { x: 60, y: 40, label: "STRIPE", sub: "decline codes, amounts" },
    { x: 340, y: 40, label: "SUPABASE", sub: "customer LTV tier" },
    { x: 60, y: 220, label: "SENTRY", sub: "error timing" },
    { x: 340, y: 220, label: "GITHUB", sub: "deploy history" },
  ];
  const center = { x: 200, y: 130 };
  return (
    <svg viewBox="0 0 400 280" className="w-full h-auto" role="img" aria-label="Four evidence sources correlated into one classification">
      <rect x="0" y="0" width="400" height="280" fill="#d9c9a3" opacity="0.35" />
      {nodes.map((n) => (
        <line
          key={n.label}
          x1={n.x}
          y1={n.y}
          x2={center.x}
          y2={center.y}
          stroke="#c1272d"
          strokeWidth="1.5"
          opacity="0.75"
        />
      ))}
      {nodes.map((n) => (
        <g key={n.label} transform={`translate(${n.x - 55}, ${n.y - 24})`}>
          <rect width="110" height="48" fill="#f4f2ec" stroke="#16130f" strokeWidth="1.5" />
          <text x="55" y="20" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontWeight={700} fontSize="11">
            {n.label}
          </text>
          <text x="55" y="34" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="8" fill="#16130f" opacity="0.75">
            {n.sub}
          </text>
          <circle cx="6" cy="6" r="2.5" fill="#c1272d" />
        </g>
      ))}
      <g transform={`translate(${center.x - 45}, ${center.y - 22})`}>
        <rect width="90" height="44" fill="#16130f" />
        <text x="45" y="19" textAnchor="middle" fontFamily="'Special Elite', cursive" fontSize="12" fill="#f4f2ec">
          CLASSIFY
        </text>
        <text x="45" y="33" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="7" fill="#f4f2ec" opacity="0.8">
          root cause
        </text>
      </g>
    </svg>
  );
}
