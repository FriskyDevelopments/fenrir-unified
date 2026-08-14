export type GateRuleKey = "arrival" | "safety" | "respect" | "privacy" | "participation" | "ready";

export interface PreviousGateAcceptance {
  rulesVersion: number;
  rulesText: string;
  disclaimerText: string;
}

export function changedGateRuleKeys(input: {
  currentVersion: number;
  currentRulesText: string;
  currentDisclaimerText: string;
  previous: PreviousGateAcceptance | null;
}): GateRuleKey[] {
  if (!input.previous) return ["arrival", "safety", "respect", "privacy", "participation", "ready"];
  if (input.previous.rulesVersion === input.currentVersion) return [];
  const changed: GateRuleKey[] = [];
  if (input.previous.disclaimerText !== input.currentDisclaimerText) changed.push("arrival");
  if (input.previous.rulesText !== input.currentRulesText) changed.push("ready");
  // A version bump is itself meaningful. If the host only changed metadata,
  // show the final consent screen so the new version is explicitly recorded.
  return changed.length > 0 ? changed : ["ready"];
}
