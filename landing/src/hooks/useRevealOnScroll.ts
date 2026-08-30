import { useEffect, useRef, useState } from "react";

// The form's native motion: evidence "surfaces" into view as you scroll the
// case file, once, never re-triggering — a courtroom exhibit gets placed on
// the table and stays there.
export default function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    // Safety net: this is primary content, not decoration — a full-page
    // capture tool, a print view, or the observer simply never firing must
    // never leave it permanently invisible. Confirmed live: Playwright's
    // fullPage screenshot (no real scroll) never intersects anything below
    // the fold, hiding entire sections with no way to recover them.
    const fallback = setTimeout(() => setRevealed(true), 2500);
    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return { ref, revealed };
}
