import { describe, expect, it } from "vitest";

import { isCurrentLeadScoringEvidence, leadEvidenceContentHash, leadEvidenceFreshnessReason } from "./evidence-snapshot";

const excerpt = "Current official product and channel evidence.";
const current = {
  id: "evidence-current", url: "https://example.com/", title: "Example", excerpt,
  sourceType: "official-website" as const, provider: "fixture", capturedAt: "2026-08-30T00:00:00Z",
  evidenceRunId: "run-current", contentHash: leadEvidenceContentHash(excerpt), freshnessStatus: "fresh" as const,
};

describe("current-run lead evidence", () => {
  it("accepts freshly captured content bound to the current run and hash", () => {
    expect(isCurrentLeadScoringEvidence(current, "run-current")).toBe(true);
  });

  it("rejects unchanged-looking prior-run evidence until explicitly revalidated into this run", () => {
    const prior = { ...current, evidenceRunId: "run-v1-7", priorRunId: "run-v1-7" };
    expect(isCurrentLeadScoringEvidence(prior, "run-current")).toBe(false);
    expect(leadEvidenceFreshnessReason(prior, "run-current")).toContain("different run");
  });

  it("rejects content whose stored hash does not match the scored excerpt", () => {
    expect(isCurrentLeadScoringEvidence({ ...current, excerpt: `${excerpt} changed` }, "run-current")).toBe(false);
  });
});
