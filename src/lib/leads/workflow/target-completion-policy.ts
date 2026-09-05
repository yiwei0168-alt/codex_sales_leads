import { ACTIVE_HYBRID_SEARCH_POLICY } from "./hybrid-search-policy";

export type TargetCompletionReason = "target-met" | "confirmed-exhaustion"
  | "provider-unavailable" | "maximum-rounds";

export function plannedCandidatePool(input: { targetCount: number; acceptedCount: number;
  discoveredUniqueCount: number; round: number }): number {
  if (input.round === 0) return Math.ceil(input.targetCount
    * ACTIVE_HYBRID_SEARCH_POLICY.initialCandidateMultiplier);
  const remaining = Math.max(0, input.targetCount - input.acceptedCount);
  const observedYield = input.discoveredUniqueCount > 0
    ? input.acceptedCount / input.discoveredUniqueCount : 2 / 3;
  const conservativeYield = Math.max(0.25, Math.min(0.8, observedYield * 0.8));
  return Math.min(150, Math.max(remaining + 5, Math.ceil(remaining / conservativeYield)));
}

export function nextNoFinalRoundCount(previous: number, input: {
  finalEligibleAdded: number; completedFreshCalls: number; hadProviderFailureOrCircuit?: boolean }): number {
  if (input.finalEligibleAdded > 0) return 0;
  if (input.hadProviderFailureOrCircuit) return previous;
  return input.completedFreshCalls > 0 ? previous + 1 : previous;
}

export function targetCompletionDecision(input: { acceptedCount: number; targetCount: number;
  completedFreshCalls: number; hadProviderFailureOrCircuit: boolean; consecutiveNoFinalRounds: number;
  round: number; maximumRounds: number }): { complete: boolean; reason?: TargetCompletionReason } {
  if (input.acceptedCount >= input.targetCount) return { complete: true, reason: "target-met" };
  if (input.completedFreshCalls === 0 && input.hadProviderFailureOrCircuit) {
    return { complete: true, reason: "provider-unavailable" };
  }
  if (input.consecutiveNoFinalRounds >= ACTIVE_HYBRID_SEARCH_POLICY.maxConsecutiveNoValueBatches) {
    return { complete: true, reason: "confirmed-exhaustion" };
  }
  if (input.round + 1 >= input.maximumRounds) return { complete: true, reason: "maximum-rounds" };
  return { complete: false };
}
