import { ToolCallCard, type ToolCallCardProps } from "@truefoundry/trueforge-ui";

/**
 * The two Recoup tools that move real money or file a real ticket — see
 * ../../mcp-server/src/index.ts. Everything else (Stripe lookups, Supabase
 * queries, the read-only get_dunning_thresholds call) renders as an ordinary
 * ToolCallCard; only these two get the high-stakes treatment.
 *
 * This is a slot override (see docs/ui-sdk/setup-custom-ui/slot-overrides.mdx):
 * we still render the real `ToolCallCard` underneath — with its `approvalSlot`
 * intact — so the actual Allow/Deny wiring is exactly the SDK's own, tested
 * behavior. We only add a banner and set `highlightCard`, a prop the card
 * already supports for exactly this purpose.
 */
const HIGH_STAKES_TOOLS = new Set(["retry_eligible_charges", "open_recovery_ticket"]);

const BANNER_COPY: Record<string, string> = {
  retry_eligible_charges: "💳 This moves real money — review the batch before approving.",
  open_recovery_ticket: "🎫 This files a real engineering ticket — review before approving.",
};

export function RecoupToolCallCard(props: ToolCallCardProps) {
  if (!HIGH_STAKES_TOOLS.has(props.toolName)) {
    return <ToolCallCard {...props} />;
  }

  return (
    <div className="recoup-approval-spotlight" data-testid="recoup-approval-spotlight">
      <div className="recoup-approval-spotlight__banner">{BANNER_COPY[props.toolName]}</div>
      <ToolCallCard {...props} highlightCard />
    </div>
  );
}
