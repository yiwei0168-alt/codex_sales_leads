import { describe, expect, it } from "vitest";

import { ACTIVE_LEAD_SCORING_POLICY, scoreWeightTotal, scoringPolicyChecksum } from "./scoring-policy";

describe("lead scoring policy v2", () => {
  it("keeps the confirmed 100 point weights", () => {
    expect(scoreWeightTotal()).toBe(100);
    expect(ACTIVE_LEAD_SCORING_POLICY.weights).toEqual({
      productAndUseCaseFit: 50,
      cooperationPathAndBuyingInfluence: 15,
      scaleAndChannelCoverage: 15,
      executionAndEnablement: 10,
      opportunityAndRisk: 10,
    });
  });

  it("uses best-track product scoring and excludes KA from tier-1 labels", () => {
    expect(ACTIVE_LEAD_SCORING_POLICY.productAndUseCaseFit.productFamilyMatchMethod).toBe("best-enabled-track");
    expect(ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.tier1Distribution).not.toContain("KA");
    expect(ACTIVE_LEAD_SCORING_POLICY.accountTierPolicy.downstream).toContain("KA");
  });

  it("has a stable checksum for run snapshots", () => {
    expect(scoringPolicyChecksum()).toMatch(/^[a-f0-9]{64}$/);
  });
});
