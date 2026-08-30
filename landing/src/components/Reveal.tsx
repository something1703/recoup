import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Evidence "surfaces" into view once, as you scroll — the case-file world's
// native motion. Uses framer-motion's whileInView (battle-tested, no risk of
// the permanently-hidden-content bug the hand-rolled IntersectionObserver
// version had) with a generous margin so content settles in well before it's
// centered on screen, not right at the viewport edge.
export default function Reveal({
  children,
  delay = 0,
  y = 24,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const }}
    >
      {children}
    </motion.div>
  );
}
