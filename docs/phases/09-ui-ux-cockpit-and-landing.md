# Phase 9: UI/UX — landing page & cockpit

## Objective

Build the two front-facing surfaces described in `docs/UI_UX_SPEC.md` — read that file in
full before starting either. This phase can start its design-direction work as early as
Phase 6 finishing (see `docs/PHASE_MAP.md`), but the cockpit's real wiring depends on the
approval gates being confirmed in Phase 8.

## Prerequisites

- Phase 8 complete for the cockpit's live wiring (design/prototyping work can start
  earlier in parallel).
- Access: Claude Design access (optional, for the first visual-direction pass), a
  domain/subdomain (optional) — see `docs/ACCESS_CHECKLIST.md` → "Before Phase 9."

## Sub-parts

### 9.1 Visual direction, before any component code
- [ ] Rough out the landing page's hero (the globe concept) and the brand pairing
      (money-green + gold-for-approval, already established in `cockpit/src/App.tsx`) —
      Claude Design is a good tool for this pass specifically because it's not code yet.
- [ ] Get one clear reference direction agreed on before writing a single component —
      changing brand direction mid-build costs more than it seems to.

### 9.2 Cockpit — extend, don't rebuild
- [ ] `cockpit/` already has a working `TrueForgeUI` integration pinned to the `recoup`
      agent and a bespoke `RecoupToolCallCard` override — build on this, don't restart it.
- [ ] Pull additional base components through the **shadcn/ui MCP server**, restrained
      polish through **Magic UI MCP** (see `docs/MCP_TOOLKIT.md` and `docs/UI_UX_SPEC.md`'s
      cockpit section for what belongs here vs. what doesn't).
- [ ] Verify `npm run build` still passes after any change — the existing `zustand`
      override in `cockpit/package.json` is load-bearing; don't remove it without
      re-testing a full production build.

### 9.3 Landing page — new surface
- [ ] Build as a separate app/route from the cockpit — different animation budget, per
      `docs/UI_UX_SPEC.md`. Hero globe (Aceternity-style), the four-step "how it works"
      section mirroring the real investigation flow, Magic UI micro-interactions
      throughout.
- [ ] Run the anti-generic-AI-look check from `docs/UI_UX_SPEC.md` before calling it done.

### 9.4 Accessibility pass
- [ ] Keyboard-reachable approval card (Tab to Allow/Deny), real contrast ratios,
      `prefers-reduced-motion` respected on the landing page's theatrical pieces.

### 9.5 The approval card renders a decision, not JSON
- [ ] Extend `RecoupToolCallCard`'s request slot to render the actual batch: charge
      count, total $, a breakdown by decline code, the agent's `reason` sentence, and
      the top affected customers by name — not the SDK's default raw-args view. This is
      the single highest-leverage Best-UI component in the product: the difference
      between "reading JSON" and "reviewing a decision."

### 9.6 Incident banner
- [ ] A persistent header in the cockpit during an active investigation — e.g. "40
      failures today vs. baseline 9 · $6,827 at risk" — updating as each stage
      completes. Gives the demo a constant visual anchor instead of only the final
      report table.

### 9.7 Cumulative recovery stat
- [ ] A small stat card reading cumulative $ recovered, sourced from the Phase 5.6
      recovery ledger. Makes the CFO-facing pitch ("how many dollars did the agent save
      this week") a real number on screen, not just a line in the README.

### 9.8 Landing page: make the counter move
- [ ] The problem-stated-in-one-number section (the industry churn stat) should tick up
      live rather than land static — Magic UI's number-ticker pattern, already the
      chosen library for this section above.

## MCP to use

**shadcn/ui MCP** and **Magic UI MCP** for both surfaces (see `docs/MCP_TOOLKIT.md`).
**Playwright MCP** for a first automated pass here if time allows, though the full QA pass
belongs in Phase 10.

## Exit criteria

- [ ] Landing page and cockpit both build cleanly, reflect the brand pairing consistently,
      and pass the accessibility checks in 9.4.
- [ ] The cockpit's approval card renders correctly against a real, live gated tool call —
      not a mock.
- [ ] The approval card renders a human-readable decision summary, not raw tool
      arguments.
