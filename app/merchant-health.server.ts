import type { MerchantHealth, MerchantStage } from "./merchant-health";

export type { MerchantHealth, MerchantStage };

export function getMerchantStage(input: {
  configured: boolean;
  activeRuleCount: number;
  conversionCount: number;
  daysSinceFirstActivity: number | null;
}): MerchantStage {
  if (input.conversionCount > 0) return "converting";
  if (input.activeRuleCount > 0) return "rules_live";
  if (input.configured) return "onboarding";
  if (
    input.daysSinceFirstActivity !== null &&
    input.daysSinceFirstActivity >= 7 &&
    input.activeRuleCount === 0
  ) {
    return "at_risk";
  }
  return "installed";
}

export function getMerchantHealth(input: {
  stage: MerchantStage;
  daysSinceLastActivity: number | null;
}): MerchantHealth {
  if (input.stage === "converting") return "healthy";
  if (input.stage === "at_risk") return "critical";
  if (input.stage === "rules_live") {
    if (input.daysSinceLastActivity !== null && input.daysSinceLastActivity > 14) {
      return "needs_attention";
    }
    return "healthy";
  }
  return "needs_attention";
}

export function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}
