import { describe, expect, it } from "vitest";

import { channelCompletionPenalty } from "./v1.7-primary-channel";

describe("v1.7 channel completion penalty", () => {
  it("deducts two percent for each corrected-output shortfall", () => {
    expect(channelCompletionPenalty({ channelId: "b2b-resale", selectedCount: 7,
      originalSubmittedCount: 10 })).toMatchObject({ missingCount: 3, ratePerMissing: 0.02, penaltyRate: 0.06 });
  });

  it("uses three percent when the original tier-one discovery already missed the target", () => {
    expect(channelCompletionPenalty({ channelId: "tier1-distribution", selectedCount: 7,
      originalSubmittedCount: 8 })).toMatchObject({
      missingCount: 3, originalTier1Shortfall: true, ratePerMissing: 0.03, penaltyRate: 0.09,
    });
  });

  it("does not add a penalty when correction fills the channel target", () => {
    expect(channelCompletionPenalty({ channelId: "tier1-distribution", selectedCount: 10,
      originalSubmittedCount: 6 }).penaltyRate).toBe(0);
  });
});
