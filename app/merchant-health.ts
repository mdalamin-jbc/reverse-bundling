export type MerchantStage =
  | "installed"
  | "onboarding"
  | "rules_live"
  | "converting"
  | "at_risk";

export type MerchantHealth = "healthy" | "needs_attention" | "critical";

export function stageLabel(stage: MerchantStage): string {
  const labels: Record<MerchantStage, string> = {
    installed: "Installed",
    onboarding: "Onboarding",
    rules_live: "Rules live",
    converting: "Converting",
    at_risk: "At risk",
  };
  return labels[stage];
}
