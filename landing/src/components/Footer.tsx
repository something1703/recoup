export default function Footer() {
  return (
    <footer className="bg-evidence text-paper/80 py-10">
      <div className="case-file flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs tracking-widest">
        <span>RECOUP — BUILT ON TRUEFORGE, REVIEWED BY QODO</span>
        <span>CASE STATUS: <span className="text-stamp font-bold">OPEN — INVESTIGATING YOUR REVENUE</span></span>
      </div>
    </footer>
  );
}
