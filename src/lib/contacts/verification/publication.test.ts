import { describe, expect, it } from "vitest";
import type { ContactVerificationDecision } from "./types";
import { planContactPublication } from "./publication";

const base: ContactVerificationDecision = {
  category: "NeedsReview", lifecycleStatus: "Active", contactType: "Unknown",
  confidenceScore: 50, roleRelevanceScore: 40, reachabilityScore: 30, developmentPriority: 41,
  employmentStatus: "Unknown", emailEvidenceStatus: "Unknown", deliveryStatus: "NotTested",
  matchedRuleIds: [], evidenceIds: [], reasons: [], reviewFlags: [], decidedAt: "2026-08-18T00:00:00.000Z",
};

describe("contact verification publication", () => {
  it("publishes deterministic Official and HighConfidence decisions as verified", () => {
    expect(planContactPublication({ ...base, category: "Official" }, "Public")).toMatchObject({ activeStatus: "Verified", accepted: true, needsReview: false });
    expect(planContactPublication({ ...base, category: "HighConfidence" }, "Unknown")).toMatchObject({ activeStatus: "Verified", accepted: true, needsReview: false });
  });

  it("preserves source status for review decisions", () => {
    expect(planContactPublication(base, "Pattern-guessed")).toMatchObject({ activeStatus: "Pattern-guessed", accepted: false, needsReview: true });
  });

  it("invalidates only a deterministic invalid lifecycle decision", () => {
    expect(planContactPublication({ ...base, lifecycleStatus: "Invalid" }, "Public")).toMatchObject({ activeStatus: "Invalid", invalidated: true, needsReview: true });
  });
});
