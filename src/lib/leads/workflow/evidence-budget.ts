import { ACTIVE_LEAD_COST_QUALITY_POLICY } from "./cost-quality-policy";
import type { LeadResearchDepth } from "./types";

export type CriticalDecisionState =
  | "identity"
  | "primary-role"
  | "eligibility-gate"
  | "scale-class"
  | "research-depth"
  | "account-tier"
  | "cooperation-path-type"
  | "publishability";

export interface EvidenceBudget {
  initialTokens: number;
  supplementalTokensPerRound: number;
  maximumRounds: number;
  maximumTotalTokens: number;
}

export function evidenceBudgetFor(depth: LeadResearchDepth): EvidenceBudget {
  const configured = ACTIVE_LEAD_COST_QUALITY_POLICY.researchBudgets[depth];
  return {
    initialTokens: configured.initialEvidenceTokens,
    supplementalTokensPerRound: configured.supplementalTokensPerRound,
    maximumRounds: configured.maximumRounds,
    maximumTotalTokens: configured.maximumTotalTokens,
  };
}

export function estimateEvidenceTokens(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  return Math.ceil(cjk + Math.max(0, text.length - cjk) / 4);
}

export function secondCitationEligible(input: {
  expectedTotalScoreChange: number;
  criticalStateChanges?: CriticalDecisionState[];
  confidenceOnly?: boolean;
}): boolean {
  if (input.confidenceOnly) return false;
  if ((input.criticalStateChanges?.length ?? 0) > 0) return true;
  return input.expectedTotalScoreChange
    >= ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.secondCitation.minimumExpectedTotalScoreChange;
}

export function preliminaryResearchDepth(input: {
  userNominated?: boolean;
  positiveScaleClass?: "Global/Enterprise" | "National" | "Regional" | "Local/Small" | "Unknown";
  strategicComplexity?: boolean;
  targetedSearchFailed?: boolean;
}): LeadResearchDepth {
  if (input.userNominated || input.strategicComplexity
    || input.positiveScaleClass === "Global/Enterprise" || input.positiveScaleClass === "National") return "deep";
  if (input.positiveScaleClass === "Local/Small" && input.targetedSearchFailed) return "limited";
  return "standard";
}
