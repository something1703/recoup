import { motion } from "framer-motion";

type ExhibitProps = {
  letter: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

export default function Exhibit({ letter, title, children, className = "", delay = 0 }: ExhibitProps) {
  return (
    <motion.div
      className={`border border-ink/25 bg-paper relative p-6 md:p-8 ${className}`}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      whileHover={{ y: -4, borderColor: "#c1272d" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <div className="absolute -top-3 left-6 bg-paper px-2 text-xs font-bold tracking-[0.2em] text-notary">
        EXHIBIT {letter}
      </div>
      <h3 className="font-stamp text-xl md:text-2xl mb-3 mt-1">{title}</h3>
      <div className="text-sm md:text-base leading-relaxed text-ink/90">{children}</div>
    </motion.div>
  );
}
