import { describe, expect, it } from "vitest";
import { verifyContact } from "@/lib/contacts/verification/decision-engine";
import { contactVerificationEvals } from "./contact-verification-evals";

describe("contact verification evaluation seed", () => {
  it("covers the initial rule-sentinel scenarios", () => {
    expect(contactVerificationEvals.length).toBeGreaterThanOrEqual(12);
    expect(new Set(contactVerificationEvals.map((item) => item.expectedCategory))).toEqual(
      new Set(["Official", "HighConfidence", "NeedsReview"]),
    );
  });

  for (const evaluation of contactVerificationEvals) {
    it(evaluation.id, () => {
      const decision = verifyContact(evaluation.input);
      expect(decision.category).toBe(evaluation.expectedCategory);
      expect(decision.lifecycleStatus).toBe(evaluation.expectedLifecycle);
    });
  }
});
