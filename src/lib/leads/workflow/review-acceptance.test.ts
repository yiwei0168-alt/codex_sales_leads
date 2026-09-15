import { describe, expect, it } from "vitest";

import type { LeadAssessmentReview } from "./types";
import { hasCompletedAssessmentReview } from "./review-acceptance";

function review(status: LeadAssessmentReview["status"]): LeadAssessmentReview {
  return {
    candidateId: "candidate-1",
    required: status !== "not-required",
    triggers: [],
    status,
    primaryModel: "fixture-primary",
    primaryScore: 80,
    finalScore: 80,
    materialDisagreements: [],
    rationale: "Fixture review state.",
    warnings: [],
  };
}

describe("hasCompletedAssessmentReview", () => {
  it.each(["not-required", "secondary-confirmed", "judge-resolved"] as const)(
    "accepts completed review status %s",
    (status) => expect(hasCompletedAssessmentReview(review(status))).toBe(true),
  );

  it.each(["targeted-research-required", "review-failed"] as const)(
    "rejects incomplete review status %s",
    (status) => expect(hasCompletedAssessmentReview(review(status))).toBe(false),
  );

  it("rejects a missing review record", () => {
    expect(hasCompletedAssessmentReview(undefined)).toBe(false);
  });
});
