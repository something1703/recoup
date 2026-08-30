// The real held-out evaluation pipeline — not a generic "AI accuracy" bar chart.
export default function EvalMethodDiagram() {
  const steps = [
    { label: "7,043 REAL\nSUBSCRIBERS", sub: "IBM Telco Customer\nChurn dataset" },
    { label: "AGENT\nCLASSIFIES", sub: "from observable\nsignals only" },
    { label: "HELD-OUT\nOUTCOME", sub: "no agent-facing\nrole can read it" },
    { label: "SCORED,\nNOT NARRATED", sub: "score-account-\nhealth-eval.ts" },
  ];
  return (
    <svg viewBox="0 0 480 140" className="w-full h-auto" role="img" aria-label="Real subscriber population, agent classification, held-out ground truth, scored evaluation">
      {steps.slice(0, -1).map((_, i) => (
        <line
          key={i}
          x1={110 + i * 120}
          y1="55"
          x2={130 + i * 120}
          y2="55"
          stroke="#16130f"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
        />
      ))}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#16130f" />
        </marker>
      </defs>
      {steps.map((s, i) => (
        <g key={s.label} transform={`translate(${i * 120}, 10)`}>
          <rect
            width="105"
            height="90"
            fill={i === 2 ? "#16130f" : "#f4f2ec"}
            stroke={i === 2 ? "#16130f" : "#16130f"}
            strokeWidth="1.5"
          />
          {s.label.split("\n").map((line, li) => (
            <text
              key={li}
              x="52"
              y={30 + li * 14}
              textAnchor="middle"
              fontFamily="'Courier Prime', monospace"
              fontWeight={700}
              fontSize="9.5"
              fill={i === 2 ? "#f4f2ec" : "#16130f"}
            >
              {line}
            </text>
          ))}
          {s.sub.split("\n").map((line, li) => (
            <text
              key={li}
              x="52"
              y={62 + li * 11}
              textAnchor="middle"
              fontFamily="'Courier Prime', monospace"
              fontSize="7.5"
              fill={i === 2 ? "#f4f2ec" : "#16130f"}
              opacity="0.75"
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}
