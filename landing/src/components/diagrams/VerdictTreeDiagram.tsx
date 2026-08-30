// The actual branching logic dunning-playbook uses — not a generic decision-tree icon.
export default function VerdictTreeDiagram() {
  return (
    <svg viewBox="0 0 460 260" className="w-full h-auto" role="img" aria-label="Card-level versus platform-level classification branching to retry or escalate">
      <line x1="230" y1="40" x2="90" y2="110" stroke="#16130f" strokeWidth="1.5" />
      <line x1="230" y1="40" x2="370" y2="110" stroke="#16130f" strokeWidth="1.5" />
      <line x1="90" y1="140" x2="90" y2="185" stroke="#16130f" strokeWidth="1.5" />
      <line x1="370" y1="140" x2="370" y2="185" stroke="#16130f" strokeWidth="1.5" />

      <g transform="translate(150, 10)">
        <rect width="160" height="40" fill="#16130f" />
        <text x="80" y="18" textAnchor="middle" fontFamily="'Special Elite', cursive" fontSize="11" fill="#f4f2ec">
          FAILED CHARGE
        </text>
        <text x="80" y="32" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="7" fill="#f4f2ec" opacity="0.8">
          decline code + evidence
        </text>
      </g>

      <g transform="translate(10, 100)">
        <rect width="160" height="42" fill="#f4f2ec" stroke="#16130f" strokeWidth="1.5" />
        <text x="80" y="19" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontWeight={700} fontSize="10">
          CARD-LEVEL
        </text>
        <text x="80" y="33" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="7.5" opacity="0.75">
          no Sentry/GitHub match
        </text>
      </g>
      <g transform="translate(290, 100)">
        <rect width="160" height="42" fill="#f4f2ec" stroke="#16130f" strokeWidth="1.5" />
        <text x="80" y="19" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontWeight={700} fontSize="10">
          PLATFORM-LEVEL
        </text>
        <text x="80" y="33" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="7.5" opacity="0.75">
          matches a deploy/error
        </text>
      </g>

      <g transform="translate(10, 185)">
        <rect width="160" height="55" fill="#f4f2ec" stroke="#1e3a5f" strokeWidth="2" />
        <text x="80" y="24" textAnchor="middle" fontFamily="'Special Elite', cursive" fontSize="12" fill="#1e3a5f">
          retry_eligible_charges
        </text>
        <text x="80" y="40" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="7.5" opacity="0.8">
          human approval required
        </text>
      </g>
      <g transform="translate(290, 185)">
        <rect width="160" height="55" fill="#f4f2ec" stroke="#c1272d" strokeWidth="2" />
        <text x="80" y="24" textAnchor="middle" fontFamily="'Special Elite', cursive" fontSize="12" fill="#c1272d">
          open_recovery_ticket
        </text>
        <text x="80" y="40" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontSize="7.5" opacity="0.8">
          human approval required
        </text>
      </g>
    </svg>
  );
}
