import { contactVerificationEvals } from "../src/data/contact-verification-evals";
import { verifyContact } from "../src/lib/contacts/verification/decision-engine";

const outcomes = contactVerificationEvals.map((evaluation) => {
  const decision = verifyContact(evaluation.input);
  return {
    id: evaluation.id,
    expectedCategory: evaluation.expectedCategory,
    actualCategory: decision.category,
    expectedLifecycle: evaluation.expectedLifecycle,
    actualLifecycle: decision.lifecycleStatus,
    passed: decision.category === evaluation.expectedCategory && decision.lifecycleStatus === evaluation.expectedLifecycle,
  };
});
const expectedHigh = outcomes.filter((item) => item.expectedCategory === "HighConfidence");
const predictedHigh = outcomes.filter((item) => item.actualCategory === "HighConfidence");
const correctHigh = predictedHigh.filter((item) => item.expectedCategory === "HighConfidence").length;
const result = {
  fixtureCount: outcomes.length,
  passed: outcomes.filter((item) => item.passed).length,
  failed: outcomes.filter((item) => !item.passed).length,
  accuracy: outcomes.filter((item) => item.passed).length / outcomes.length,
  highConfidenceRecall: expectedHigh.length ? correctHigh / expectedHigh.length : 0,
  highConfidencePrecision: predictedHigh.length ? correctHigh / predictedHigh.length : 0,
  outcomes,
  note: "This seed is a rule-sentinel set, not the final human-labelled 100+ record release benchmark.",
};
console.log(JSON.stringify(result, null, 2));
if (result.failed > 0) process.exitCode = 1;
