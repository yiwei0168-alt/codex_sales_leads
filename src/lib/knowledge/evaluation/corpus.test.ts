import { describe, expect, it } from "vitest";
import { buildKnowledgeEvaluationCorpus, knowledgeEvaluationCorpusHash } from "./corpus";

describe("knowledge evaluation corpus", () => {
  it("freezes 160 base and 40 boundary cases without one-model concentration", () => {
    const corpus = buildKnowledgeEvaluationCorpus();
    expect(corpus.cases.filter((item) => item.group === "base")).toHaveLength(160);
    expect(corpus.cases.filter((item) => item.group === "boundary")).toHaveLength(40);
    expect(new Set(corpus.cases.map((item) => item.id)).size).toBe(200);
    expect(corpus.cases.filter((item) => item.expectedEntities.includes("WR3000")).length).toBeLessThanOrEqual(10);
    expect(new Set(corpus.cases.flatMap((item) => item.expectedEntities))).toHaveLength(34);
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
  });
});
