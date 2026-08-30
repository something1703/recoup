import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function Nav({ dark = false }: { dark?: boolean }) {
  const text = dark ? "text-paper" : "text-ink";
  return (
    <nav className={`case-file flex items-center justify-between gap-3 py-5 ${text}`}>
      <Link to="/" aria-label="Recoup home" className="shrink-0">
        <Logo variant={dark ? "light" : "dark"} className="h-9 md:h-12 w-auto" />
      </Link>
      <div className="flex items-center gap-4 md:gap-6 text-[11px] md:text-sm font-bold tracking-wider">
        <Link to="/how-it-works" className="hover:text-stamp transition-colors">
          HOW IT WORKS
        </Link>
        <a
          href="https://github.com/something1703/recoup"
          target="_blank"
          rel="noreferrer"
          className="hover:text-stamp transition-colors"
        >
          THE REPO
        </a>
      </div>
    </nav>
  );
}
