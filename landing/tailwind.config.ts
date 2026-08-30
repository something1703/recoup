import type { Config } from "tailwindcss";

// Deposition Exhibit direction (see DESIGN.md once written): a document/case-file
// world, not a generic SaaS gradient world. Every token below exists in that world.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16130f",
        paper: "#f4f2ec",
        "paper-dim": "#e8e4d8",
        stamp: "#c1272d",
        notary: "#1e3a5f",
        manila: "#d9c9a3",
        evidence: "#0d0c0a",
      },
      fontFamily: {
        stamp: ["'Special Elite'", "cursive"],
        type: ["'Courier Prime'", "monospace"],
      },
      backgroundImage: {
        "paper-grain":
          "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.02) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.015) 0%, transparent 45%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
