import { describe, expect, it } from "vitest";
import { filterAcceptedCandidateChunks } from "./candidate-chunk-gate-v3";

describe("v3 candidate chunk ingest gate", () => {
  const chunks = [
    { id: "parsed", unitType: "page", unitIndex: 1, evidenceStatus: "parsed" as const },
    { id: "unreviewed", unitType: "page", unitIndex: 2, evidenceStatus: "candidate" as const },
    { id: "accepted", unitType: "page", unitIndex: 3, evidenceStatus: "candidate" as const },
    { id: "decorative", unitType: "page", unitIndex: 4, evidenceStatus: "candidate" as const },
  ];

  it("includes parsed and exact accepted candidates only", () => {
    const result = filterAcceptedCandidateChunks([
      { unitType: "page", unitIndex: 2 },
      { unitType: "page", unitIndex: 3, humanReviewDecision: "accept-candidate" },
      { unitType: "page", unitIndex: 4, humanReviewDecision: "decorative-no-body" },
    ], chunks);
    expect(result.map((chunk) => chunk.id)).toEqual(["parsed", "accepted"]);
  });

  it("does not let another unit inherit an acceptance", () => {
    const result = filterAcceptedCandidateChunks([
      { unitType: "page", unitIndex: 30, humanReviewDecision: "accept-candidate" },
    ], chunks);
    expect(result.map((chunk) => chunk.id)).toEqual(["parsed"]);
  });
});
