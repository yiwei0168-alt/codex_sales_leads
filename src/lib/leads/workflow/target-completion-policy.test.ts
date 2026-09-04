import { describe, expect, it } from "vitest";

import { nextNoFinalRoundCount, plannedCandidatePool, targetCompletionDecision } from "./target-completion-policy";

describe("target completion policy", () => {
  it("starts at 1.5x and expands from the observed MX Retail end-to-end yield", () => {
    expect(plannedCandidatePool({ targetCount: 30, acceptedCount: 0, discoveredUniqueCount: 0, round: 0 })).toBe(45);
    expect(plannedCandidatePool({ targetCount: 30, acceptedCount: 6, discoveredUniqueCount: 23, round: 1 })).toBe(96);
  });

  it("does not convert provider failure into a no-value batch", () => {
    expect(nextNoFinalRoundCount(0, { finalEligibleAdded: 0, completedFreshCalls: 0 })).toBe(0);
    expect(targetCompletionDecision({ acceptedCount: 6, targetCount: 30, completedFreshCalls: 0,
      hadProviderFailureOrCircuit: true, consecutiveNoFinalRounds: 0, round: 1,
      maximumRounds: 5 })).toEqual({ complete: true, reason: "provider-unavailable" });
  });

  it("requires two completed zero-value rounds before confirmed exhaustion", () => {
    const first = nextNoFinalRoundCount(0, { finalEligibleAdded: 0, completedFreshCalls: 3 });
    expect(targetCompletionDecision({ acceptedCount: 6, targetCount: 30, completedFreshCalls: 3,
      hadProviderFailureOrCircuit: false, consecutiveNoFinalRounds: first, round: 1,
      maximumRounds: 5 }).complete).toBe(false);
    const second = nextNoFinalRoundCount(first, { finalEligibleAdded: 0, completedFreshCalls: 2 });
    expect(targetCompletionDecision({ acceptedCount: 6, targetCount: 30, completedFreshCalls: 2,
      hadProviderFailureOrCircuit: false, consecutiveNoFinalRounds: second, round: 2,
      maximumRounds: 5 }).reason).toBe("confirmed-exhaustion");
  });
});
