import { describe, expect, it } from "vitest";

import { completedStageMetric, detectWorkflowOptimizationOpportunities,
  workflowDependencyFingerprint } from "./workflow-telemetry";

describe("workflow efficiency telemetry", () => {
  it("stores sizes and counts without storing artifact bodies in metadata", () => {
    const metric = completedStageMetric({ stage: "score_candidates", startedAt: Date.now() - 10,
      input: { privateText: "sensitive input" }, output: { summary: "large result" },
      inputItems: 2, outputItems: 4, generatedArtifacts: 4, validArtifacts: 3,
      downstreamUsedArtifacts: 2, dependencies: { schema: "v5" } });
    expect(metric).toMatchObject({ stage: "score_candidates", inputItems: 2, outputItems: 4,
      generatedArtifacts: 4, validArtifacts: 3, downstreamUsedArtifacts: 2, metadata: {} });
    expect(JSON.stringify(metric)).not.toContain("sensitive input");
    expect(metric.dependencyFingerprint).toHaveLength(64);
  });

  it("uses a stable dependency fingerprint independent of object insertion order", () => {
    expect(workflowDependencyFingerprint("score", { schema: "v5", model: "flash" }))
      .toBe(workflowDependencyFingerprint("score", { model: "flash", schema: "v5" }));
  });

  it("detects low-use paid artifacts but does not apply an optimization automatically", () => {
    const metric = completedStageMetric({ stage: "collect_evidence", startedAt: Date.now(), input: ["q"],
      output: Array.from({ length: 10 }, (_, index) => ({ id: index })), inputItems: 1, outputItems: 10,
      paidSearchCredits: 8, generatedArtifacts: 10, validArtifacts: 3, downstreamUsedArtifacts: 2 });
    const opportunities = detectWorkflowOptimizationOpportunities([metric], []);
    expect(opportunities.map((item) => item.opportunityKey)).toEqual(expect.arrayContaining([
      "low-downstream-artifact-use", "low-paid-acquisition-validity",
    ]));
    expect(opportunities.every((item) => item.recommendedAction.length > 0)).toBe(true);
  });
});
