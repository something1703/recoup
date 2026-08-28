# UI/UX spec

Two different design problems, two different animation budgets. Confusing them is the
most common way a demo ends up either boring or gimmicky.

## The landing page — theatrics belong here

This is a marketing surface a judge sees for 15 seconds before anything else. It should
look like a funded startup's homepage, not a hackathon README with a hero image.

**The centerpiece: a 3D globe, not decoration.** Recoup's whole premise is money leaking
out of a business in real time, everywhere its customers are. A rotating globe with pulses
of light lifting off it — each one a recovered payment, colored by segment (safe retry vs.
escalated) — *is* the product story, not an abstract "AI is global" cliché. Land on this
in the hero, with the headline and one-line pitch overlaid.

**Section flow:**

1. **Hero** — the globe, headline (*"An SRE for your revenue"*), one-line subhead, CTA.
2. **The problem, stated in one number** — an animated counter ticking up (Magic UI's
   number-ticker pattern) to a real, citable industry stat on involuntary churn, then
   settling. Numbers that move earn attention; numbers that appear static don't.
3. **How it works** — four steps, visually mirroring the actual sub-agent fan-out from
   `docs/ARCHITECTURE.md`'s investigation-flow diagram: Investigate → Classify → Quantify
   → Approve. Reuse the real shape of the system as the marketing narrative — it's more
   credible than an invented explainer because it's literally what happens on screen two
   minutes later in the demo.
4. **Live-feeling proof** — a small, looping animated preview of the approval-card moment
   (the actual bespoke high-stakes card from the cockpit, not a mockup of it).
5. **CTA / footer.**

**Library choices, and why:**

- **Aceternity UI** for the hero's theatrical pieces — it has a known 3D-globe-in-hero
  pattern and spotlight/parallax effects built on Framer Motion + Tailwind. Use it
  *selectively*: 2026 write-ups on this library specifically warn that over-applying its
  effects site-wide makes a page look templated. One theatrical hero, not five.
- **Magic UI** for every micro-interaction below the fold — the number ticker, blur-fade
  section entrances, the shimmer CTA button. This is where "polished" actually lives; it's
  restraint, not spectacle.
- **Motion (Framer Motion)** as the underlying engine both of the above sit on — don't add
  a second animation library for anything either already covers.
- **Lenis** for smooth-scroll inertia, landing page **only**. Explicitly do not use it on
  the cockpit — smooth-scroll inertia reads as lag on a data-dense working dashboard.
- Pull all of the above through the **shadcn/ui** and **Magic UI MCP servers** (see
  `docs/MCP_TOOLKIT.md`) rather than hand-copying component code — the servers keep the
  agent honest about install commands and actual current APIs.

**The anti-generic-AI-look check:** before calling the landing page done, look at it next
to three other AI-hackathon-project landing pages. If it's indistinguishable from them at
a glance, the brand pass (color, typography, the globe) didn't do its job — go back to
`docs/CODE_QUALITY_BAR.md`'s design-review step, or run it through Standout if the team
wants an automated second opinion (see `docs/MCP_TOOLKIT.md`).

## The cockpit — restraint belongs here

This is a working tool someone approves real actions from. Every animation choice here
answers "does this help someone understand system state faster," not "does this look
impressive." A dashboard that feels like the landing page is a dashboard nobody trusts.

- Base components: **shadcn/ui**, as already wired into `cockpit/`.
- The one deliberately loud element: the bespoke `RecoupToolCallCard` override
  (`cockpit/src/RecoupToolCallCard.tsx`, already built) — gold border, banner, for exactly
  the two gated tools. Everything else stays visually quiet *so that* this card reads as
  unmistakably different the moment it appears. Loudness here is a signal, not decoration
  — don't dilute it by making anything else in the cockpit compete with it.
- Micro-interactions are fine (Magic UI's subtler pieces — a gentle number tick-up on the
  $-at-risk figure once, not looping) but skip anything with a perceptible duration on data
  the user is actively scanning (tables, the sub-agent trace list).
- No smooth-scroll libraries, no parallax, no hero-style effects anywhere in this app.

## Brand

Carried over from the cockpit theme already in `cockpit/src/App.tsx`: a money-green
primary (`#0f6b3f` / `#0c5733` hover) with a gold accent reserved *specifically* for the
high-stakes approval moment (`#b8860b` border, warm gradient banner) — gold means "this is
the moment," and it should mean that nowhere else in the product. Reuse this exact pairing
on the landing page rather than inventing a second palette — one brand, two surfaces.

## Accessibility, non-negotiable regardless of demo pressure

Real contrast ratios (shadcn's defaults are compliant; don't override them for a "nicer"
muted gray), keyboard reachability on the approval card specifically — a judge or a real
user should be able to Tab to Allow/Deny, not only click it — and respect
`prefers-reduced-motion` on the landing page's theatrical pieces at minimum.
