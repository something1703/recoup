import { SubAgentCard, type SubAgentCardProps } from "@truefoundry/trueforge-ui";

/**
 * Slot override, same pattern as RecoupToolCallCard.tsx: render the real
 * SubAgentCard underneath (its expand/collapse and status logic untouched)
 * and add only a className for the case-file treatment — never reimplement
 * the internals. Without this, a sub-agent thread renders in the SDK's
 * stock card, the one visibly un-themed surface in an otherwise bespoke
 * cockpit, right in the middle of the demo's four-source correlation beat.
 */
export function RecoupSubAgentCard(props: SubAgentCardProps) {
  return <SubAgentCard {...props} className={`recoup-subagent-card ${props.className ?? ""}`} />;
}
