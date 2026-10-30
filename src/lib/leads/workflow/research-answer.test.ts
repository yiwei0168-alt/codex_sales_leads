import { describe, expect, it } from "vitest";
import { isCudyRelationshipQuestion, researchAnswerInput, researchQuestionHash } from "./research-answer";
import { hasCompletedAssessmentReview } from "./review-acceptance";
import type { LeadAssessmentReview } from "./types";

describe("private research answers",()=>{
  it("does not infer relationship scope from keywords in broader questions",()=>{
    const q="Is Example independent of Cudy, and does it currently have any supplier, reseller, distribution, ownership, or contractual relationship with Cudy?";
    expect(isCudyRelationshipQuestion(q,"Example")).toBe(true);
    expect(isCudyRelationshipQuestion(q,"Other Company")).toBe(false);
    expect(isCudyRelationshipQuestion(q+" Also confirm revenue.","Example")).toBe(false);
    expect(isCudyRelationshipQuestion("Confirm independence and financial solvency","Example")).toBe(false);
    expect(researchQuestionHash(q)).not.toBe(researchQuestionHash(q+" "));
  });
  it("rejects forged ownership fields and invalid input",()=>{
    const input={candidateId:"candidate-1",questionHash:"a".repeat(64),relationshipStatus:"none",answer:"No current relationship"};
    expect(researchAnswerInput.safeParse(input).success).toBe(true);
    for(const extra of [{userId:"peer"},{status:"judge-resolved"},{relationshipStatus:"approved"},{answer:""}])
      expect(researchAnswerInput.safeParse({...input,...extra}).success).toBe(false);
  });
  it("requires a recorded owner evidence receipt for the new completion status",()=>{
    const base={status:"owner-evidence-resolved"} as LeadAssessmentReview;
    expect(hasCompletedAssessmentReview(base)).toBe(false);
    expect(hasCompletedAssessmentReview({...base,ownerEvidence:{answerId:"11111111-1111-4111-8111-111111111111",
      questionHash:"a".repeat(64),receivedAt:"2026-10-30T00:00:00Z",scope:"current-cudy-relationship",originalDecision:"targeted-research"}})).toBe(true);
  });
});
