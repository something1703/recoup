type LogoProps = {
  /** "light" = paper-colored mark for the dark evidence-room hero; "dark" = ink mark for paper sections. */
  variant?: "light" | "dark";
  className?: string;
};

// The wordmark IS a rubber stamp, not an icon-plus-wordtype lockup — the
// mechanism ("we submit evidence") lives in the mark itself, not just the copy.
export default function Logo({ variant = "dark", className = "" }: LogoProps) {
  const color = variant === "light" ? "#f4f2ec" : "#16130f";
  return (
    <svg viewBox="0 0 300 96" className={className} role="img" aria-label="Recoup">
      <g transform="rotate(-2 150 48)">
        <rect x="4" y="4" width="292" height="88" rx="3" fill="none" stroke={color} strokeWidth="3" />
        <rect x="9" y="9" width="282" height="78" rx="2" fill="none" stroke={color} strokeWidth="1" opacity="0.55" />
        <text
          x="150"
          y="52"
          textAnchor="middle"
          fontFamily="'Special Elite', cursive"
          fontSize="34"
          letterSpacing="3"
          fill={color}
        >
          RECOUP
        </text>
        <text
          x="150"
          y="74"
          textAnchor="middle"
          fontFamily="'Courier Prime', monospace"
          fontWeight={700}
          fontSize="9"
          letterSpacing="4"
          fill={color}
        >
          REVENUE, ON THE RECORD
        </text>
      </g>
    </svg>
  );
}
