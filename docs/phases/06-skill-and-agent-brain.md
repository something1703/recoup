# Phase 6: The brain — skill & agent spec

## Objective

Turn the connected tools (Phases 4 and 5) into an actual agent, with the investigation
procedure — this project's real intellectual property — written down as a skill rather
than buried in a prompt.

## Prerequisites

- Phases 4 and 5 complete.
- Access: none new.

## Sub-parts

### 6.1 Review and refine the skill
- [ ] Read `skills/dunning-playbook/SKILL.md` in full. It already encodes the five-stage
      procedure (triage, classify, quantify, decide, report) and the four-subagent
      classification approach — treat it as a first draft to sharpen, not a placeholder.
- [ ] Push it to GitHub, register it in Settings → Skills as `dunning-playbook`.

### 6.2 Create the agent
- [ ] Use `agent-spec.json` in the repo root as the manifest — it already wires all five
      catalog connectors, the custom server, the skill, sandbox, generative UI, and
      dynamic sub-agents.
- [ ] Create the agent via the SDK (`client.agents.create`) or by rebuilding the same
      configuration in the chat UI composer and saving it as `recoup` — the exact name the
      cockpit (Phase 9) pins to.

### 6.3 Sanity-check the brain, not just the plumbing
- [ ] Ask it a basic investigative question ("check for failed payments today") and
      confirm it reasons through the skill's stages rather than jumping straight to an
      action — this is a prompt-quality check, distinct from Phase 4's plumbing checks.

## MCP to use

None new — this phase is skill authorship and agent configuration, using the
already-connected tools from Phases 4 and 5.

## Exit criteria

- [ ] The `recoup` agent exists, references the `dunning-playbook` skill, and answers a
      basic investigative prompt by working through the skill's stages in order.
