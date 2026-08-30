import useRevealOnScroll from "../hooks/useRevealOnScroll";

type ExhibitProps = {
  letter: string;
  title: string;
  children: React.ReactNode;
  className?: string;
};

export default function Exhibit({ letter, title, children, className = "" }: ExhibitProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`border border-ink/25 bg-paper relative p-6 md:p-8 transition-all duration-500 ease-out ${
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${className}`}
    >
      <div className="absolute -top-3 left-6 bg-paper px-2 text-xs font-bold tracking-[0.2em] text-notary">
        EXHIBIT {letter}
      </div>
      <h3 className="font-stamp text-xl md:text-2xl mb-3 mt-1">{title}</h3>
      <div className="text-sm md:text-base leading-relaxed text-ink/90">{children}</div>
    </div>
  );
}
