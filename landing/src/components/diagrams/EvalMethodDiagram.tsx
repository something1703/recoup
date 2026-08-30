import { motion } from "framer-motion";

// The real held-out evaluation pipeline — not a generic "AI accuracy" bar chart.
export default function EvalMethodDiagram() {
  const steps = [
    { label: "7,043 REAL\nSUBSCRIBERS", sub: "IBM Telco Customer\nChurn dataset" },
    { label: "AGENT\nCLASSIFIES", sub: "from observable\nsignals only" },
    { label: "HELD-OUT\nOUTCOME", sub: "no agent-facing\nrole can read it" },
    { label: "SCORED,\nNOT NARRATED", sub: "score-account-\nhealth-eval.ts" },
  ];
  return (
    <svg
      viewBox="0 0 480 140"
      className="w-full h-auto"
      role="img"
      aria-label="Real subscriber population, agent classification, held-out ground truth, scored evaluation"
    >
      {steps.slice(0, -1).map((_, i) => (
        <motion.line
          key={i}
          x1={110 + i * 120}
          y1="55"
          x2={130 + i * 120}
          y2="55"
          stroke="#16130f"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.3, delay: 0.3 + i * 0.28 }}
        />
      ))}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#16130f" />
        </marker>
      </defs>
      {steps.map((s, i) => (
        // Static position on a plain outer <g>; the motion.g nested inside
        // only carries the animation. Framer Motion writes its own CSS
        // transform onto whatever element it animates, which silently wins
        // over an XML transform="translate(...)" attribute on that SAME
        // element — confirmed live via getBoundingClientRect: all four boxes
        // collapsed to one identical x position until this split fixed it.
        <g key={s.label} transform={`translate(${i * 120}, 10)`}>
        <motion.g
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.4, delay: i * 0.28, ease: "backOut" }}
        >
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
        </motion.g>
        </g>
      ))}
    </svg>
  );
}
