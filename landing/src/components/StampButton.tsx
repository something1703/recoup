import { motion } from "framer-motion";
import type { ReactNode } from "react";

type StampButtonProps = {
  href: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
  className?: string;
  external?: boolean;
};

// The button IS a stamp being pressed, not a rectangle with a hover state —
// tilts on hover like it's being lined up, slams flat + darkens on press.
export default function StampButton({ href, variant = "primary", children, className = "", external = true }: StampButtonProps) {
  const base = "inline-block font-bold tracking-wider text-sm px-6 py-3 select-none";
  const styles =
    variant === "primary"
      ? "bg-stamp text-paper"
      : "border-2 border-paper/40 text-paper";

  return (
    <motion.a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${base} ${styles} ${className}`}
      initial={{ rotate: 0 }}
      whileHover={{ rotate: -2, scale: 1.04, y: -2 }}
      whileTap={{ rotate: 0, scale: 0.96, y: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
    >
      {children}
    </motion.a>
  );
}
