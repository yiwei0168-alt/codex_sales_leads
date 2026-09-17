import { describe, expect, it } from "vitest";
import { buildKnowledgeEvaluationCorpus, knowledgeEvaluationCorpusHash } from "./corpus";

describe("knowledge evaluation corpus", () => {
  it("freezes 250 base and 50 boundary cases across at least 50 catalog models", () => {
    const corpus = buildKnowledgeEvaluationCorpus();
    expect(corpus.cases.filter((item) => item.group === "base")).toHaveLength(250);
    expect(corpus.cases.filter((item) => item.group === "boundary")).toHaveLength(50);
    expect(new Set(corpus.cases.map((item) => item.id)).size).toBe(300);
    expect(corpus.cases.filter((item) => item.expectedEntities.includes("WR3000")).length).toBeLessThanOrEqual(10);
    expect(new Set(corpus.cases.filter((item) => item.group === "base").flatMap((item) => item.expectedEntities)).size).toBeGreaterThanOrEqual(50);
    expect(corpus.cases.filter((item) => item.tags.includes("regression-wr3000-wr6500h"))).toHaveLength(1);
  });

  it("is deterministic and includes every target action and safety outcome", () => {
    const first = buildKnowledgeEvaluationCorpus();
    const second = buildKnowledgeEvaluationCorpus();
    expect(knowledgeEvaluationCorpusHash(first)).toBe(knowledgeEvaluationCorpusHash(second));
    expect(new Set(first.cases.map((item) => item.expectedAction))).toEqual(new Set([
      "open-document", "fact-query", "compare-facts", "explain",
    ]));
    expect(first.cases.some((item) => item.expectedOutcome === "deny")).toBe(true);
    expect(first.cases.some((item) => item.tags.includes("negation"))).toBe(true);
    expect(first.cases.some((item) => item.tags.includes("unit-boundary"))).toBe(true);
    for (const sourceGroup of new Set(first.cases.filter((item) => item.group === "base").map((item) => item.sourceGroup))) {
      expect(new Set(first.cases.filter((item) => item.sourceGroup === sourceGroup).map((item) => item.split))).toHaveLength(1);
    }
  });
});
