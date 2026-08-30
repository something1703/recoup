# MCP Toolkit

Every server below was checked, not assumed — either against TrueForge's own shipped
catalog (`packages/trueforge/catalog/mcp-catalog.yaml` in the TrueForge repo) or against
the vendor's current, live documentation. If you're the coding agent: use these, don't
hand-roll an equivalent. Verify a server is still live before depending on it in a phase
— MCP endpoints and toolsets do change.

## In TrueForge's own catalog — connect via Settings → Connectors, one-click OAuth

| Server | Used for | Auth | Phase |
|---|---|---|---|
| **Stripe** | Failed-charge data, the retry target | OAuth (DCR), test mode | 4 |
| **Sentry** | Error-correlation evidence | OAuth (DCR) | 4 |
| **GitHub** | Deploy-correlation evidence (read-only toolset) | Header (PAT) | 4 |
| **Linear** | The engineering-ticket escalation path | OAuth (DCR) | 4 |

These need no custom integration work — they're config, not code. Connect each, then do
one real tool call through TrueForge's chat UI to confirm it actually returns data before
moving on; a connector that's "added" but never verified is a demo-day surprise waiting to
happen. (This is exactly how we caught the Supabase removal below — worth repeating for
every connector still on this list before the final demo, not just once at setup.)

**Removed: Supabase.** It was on this list through Phase 4, but its only data-query tool,
`execute_sql`, is vendor-annotated destructive — the agent's `@read-only` restriction
correctly filters it out, leaving zero usable tools behind an unauthenticated, `preload:
true` connector. Confirmed live: a real investigation run stalled on "MCP Authentication
Required — supabase" before ever calling a tool that connector could have served anyway.
`get_customer_ltv` on `recoup-actions` (below) was already the real read path — see gotcha
#7 in `docs/ARCHITECTURE.md`. Removed from `agent-spec.json`; also remove it from the live
`recoup` agent's MCP servers in TrueForge's Settings → Agents if it's still listed there,
since the manifest file doesn't push itself to an already-created agent.

## Custom, purpose-built — not in any catalog

| Server | Used for | Why not use a generic one instead |
|---|---|---|
| **`recoup-actions`** (`mcp-server/`) | `retry_eligible_charges`, `open_recovery_ticket`, `get_dunning_thresholds`, `get_customer_ltv` | Batch-shaped so one approval covers a whole segment (TrueForge doesn't yet support "approve once" for repeated calls), and scoped to exactly two gated actions rather than exposing Stripe's or Linear's full write surface. `get_customer_ltv` exists because the Supabase catalog connector's own tools turned out **not** to cover this — checked directly (`docs/ARCHITECTURE.md` gotcha #7): its only data-query tool, `execute_sql`, is correctly annotated destructive, so `@read-only` leaves it with no working read path at all. |

## External, real, and worth using for the *build itself* (not the agent's own tools)

These aren't things the Recoup agent calls at runtime — they're MCP servers **the coding
agent building this project** should use, because they're the best currently-maintained
option for that job. Ask the human for whatever access each needs.

| Server | Job | Endpoint / package | Phase |
|---|---|---|---|
| **GitHub MCP** (official) | Repo, PR, and issue management while building — create branches, open PRs, check CI status | `https://api.githubcopilot.com/mcp/` (append `/readonly` for the read-only toolset variant — use that variant for anything that only needs to inspect, never write) | 1, throughout |
| **Google Cloud Run MCP** (official, `GoogleCloudPlatform/cloud-run-mcp`) | Deploy `trueforge` (hosted mode) and `recoup-actions` straight to Cloud Run, list services, pull logs, without the human hand-running `gcloud` | Self-hosted or run locally against the GCP project via IAM — see the server's README for the two connection modes | 2, 5, 10 |
| **shadcn/ui MCP** (community, e.g. `Jpisnice/shadcn-ui-mcp-server`) | Pull correct, accessible base components (dialogs, buttons, cards) into the cockpit with real install commands instead of hallucinated JSX | npm-installable local server | 9 |
| **Magic UI MCP** (official, `magicuidesign/mcp`) | Polish: animated counters, blur-fade text, marquees, shimmer — the "$X at risk" tick-up moment | npm-installable local server | 9 |
| **Playwright MCP** | Automated UI testing/inspection of the cockpit and landing page before the recorded demo — catch a broken approval flow before a judge does | `@playwright/mcp` | 10 |

**Explicitly not used, and why:**

- **Figma MCP / Framelink** — only useful when a Figma file already exists as the design
  source of truth. This project has no such file; the design direction was set directly
  and now lives in the shipped landing/cockpit design system itself.
- **Neon MCP** — considered during planning, dropped once Supabase (already a one-click
  catalog connector, also free-tier) covered the same need with less custom code.

## How to evaluate a new one, before adding it here

1. Is it official (vendor-maintained) or, if not, does it have real stars, recent commits,
   and low open-issue count? Prefer official.
2. Does it support **remote** transport (Streamable HTTP or SSE)? TrueForge's own
   connectors require this — a stdio-only server needs a remote wrapper first (see the
   `recoup-actions` server for the pattern).
3. Does it expose the narrowest tool set that does the job, or does adding it hand the
   agent more write/destructive capability than the task needs? If the latter, prefer a
   scoped/read-only variant, or write a narrow custom tool instead — check the *actual*
   tool annotations before assuming a catalog entry covers you: Supabase's own connector
   looked sufficient on paper, but its only data-query tool is annotated destructive, so
   `get_customer_ltv` on `recoup-actions` ended up being the real read path after all
   (`docs/ARCHITECTURE.md` gotcha #7). Verify, don't assume, same as everywhere else in
   this project.
4. Check it's still live — hit its health endpoint or run one real tool call — before a
   phase depends on it.
