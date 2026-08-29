import { ToolCallCard, type ToolCallCardProps } from "@truefoundry/trueforge-ui";

/**
 * The two Recoup tools that move real money or file a real ticket — see
 * ../../mcp-server/src/index.ts. Everything else (Stripe lookups, Supabase
 * queries, the read-only get_dunning_thresholds/get_customer_ltv calls) renders
 * as an ordinary ToolCallCard; only these two get the high-stakes treatment.
 *
 * This is a slot override (see docs/ui-sdk/setup-custom-ui/slot-overrides.mdx):
 * we still render the real `ToolCallCard` underneath — with its `approvalSlot`
 * intact — so the actual Allow/Deny wiring is exactly the SDK's own, tested
 * behavior. We only add a banner and set `highlightCard`, a prop the card
 * already supports for exactly this purpose.
 *
 * Deliberately NOT attempted here: rendering the actual batch/ticket contents
 * (charge count, $, decline codes) instead of the SDK's default request view.
 * Checked the installed @truefoundry/trueforge-ui@0.2.4 surface first —
 * ToolCallCardProps only ever hands this component pre-rendered ReactNodes for
 * requestSlot/responseSlot/approvalSlot, with no tool_call_id/turn_id and no
 * hook that exposes the raw arguments. Scraping the rendered DOM to fake a
 * "decision summary" would be a real correctness risk (silently wrong or
 * broken on the next SDK patch) for a purely cosmetic win — not worth it.
 */
const HIGH_STAKES_TOOLS = new Set(["retry_eligible_charges", "open_recovery_ticket"]);

// Belt and suspenders, matching mcp-server/src/index.ts's own defense-in-depth
// stance: only spotlight these two tool names when they're actually coming
// from our own recoup-actions server, not some unrelated future connector
// that happens to register a same-named tool.
const HIGH_STAKES_SERVER = "recoup-actions";

const BANNER_COPY: Record<string, string> = {
  retry_eligible_charges: "💳 This moves real money — review the batch before approving.",
  open_recovery_ticket: "🎫 This files a real engineering ticket — review before approving.",
};

export function RecoupToolCallCard(props: ToolCallCardProps) {
  const isHighStakes = HIGH_STAKES_TOOLS.has(props.toolName) && props.mcpServerName === HIGH_STAKES_SERVER;
  if (!isHighStakes) {
    return <ToolCallCard {...props} />;
  }

  return (
    <div className="recoup-approval-spotlight" data-testid="recoup-approval-spotlight">
      <div className="recoup-approval-spotlight__banner">{BANNER_COPY[props.toolName]}</div>
      <ToolCallCard {...props} highlightCard />
    </div>
  );
}
