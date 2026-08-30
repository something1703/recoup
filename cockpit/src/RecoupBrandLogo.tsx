import { useBrandName } from "@truefoundry/trueforge-ui";

/**
 * Slot override for BrandLogo. The default slot renders `theme.brand.logo`
 * (an <img src="/recoup-logo.svg">) — but an externally-referenced SVG loaded
 * via <img> is opaque to the page's own CSS and @font-face rules, so it can
 * never pick up the Special Elite / Courier Prime loaded in index.html no
 * matter what font-family the SVG file itself declares. Rendering the mark
 * inline instead (same shape as landing/src/components/Logo.tsx) puts it in
 * the live DOM, where it inherits the page's real fonts for free.
 */
export function RecoupBrandLogo({ className }: { className?: string }) {
  const name = useBrandName();
  return (
    <svg viewBox="0 0 300 96" className={className} role="img" aria-label={name} style={{ height: "1.75rem", width: "auto" }}>
      <g transform="rotate(-2 150 48)">
        <rect x="4" y="4" width="292" height="88" rx="3" fill="none" stroke="#16130f" strokeWidth="3" />
        <rect x="9" y="9" width="282" height="78" rx="2" fill="none" stroke="#16130f" strokeWidth="1" opacity="0.55" />
        <text x="150" y="52" textAnchor="middle" fontFamily="'Special Elite', cursive" fontSize="34" letterSpacing="3" fill="#16130f">
          RECOUP
        </text>
        <text x="150" y="74" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontWeight={700} fontSize="9" letterSpacing="4" fill="#16130f">
          REVENUE, ON THE RECORD
        </text>
      </g>
    </svg>
  );
}
