export type KnowledgeEvaluationAction = "open-document" | "fact-query" | "compare-facts" | "explain";

export interface KnowledgeEvaluationCase {
  id: string;
  group: "base" | "boundary";
  language: "zh-CN" | "en";
  query: string;
  expectedAction: KnowledgeEvaluationAction;
  expectedEntities: string[];
  expectedAttribute?: string;
  expectedOutcome: "route" | "clarify" | "deny" | "insufficient-evidence";
  sourceBasis: "synthetic-contract";
  tags: string[];
}

export interface KnowledgeEvaluationCorpus {
  version: "knowledge-eval-v1";
  cases: KnowledgeEvaluationCase[];
}
