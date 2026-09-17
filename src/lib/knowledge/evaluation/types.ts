export type KnowledgeEvaluationAction = "open-document" | "fact-query" | "compare-facts" | "explain";
export type KnowledgeEvaluationSplit = "development" | "validation" | "holdout";

export interface KnowledgeEvaluationCase {
  id: string;
  group: "base" | "boundary";
  split: KnowledgeEvaluationSplit;
  sourceGroup: string;
  language: "zh-CN" | "en";
  query: string;
  expectedAction: KnowledgeEvaluationAction;
  expectedEntities: string[];
  expectedAttribute?: string;
  expectedOutcome: "route" | "clarify" | "deny" | "insufficient-evidence";
  sourceBasis: "routing-contract" | "registered-source-required";
  goldStatus: "routing-reviewed" | "pending-human-answer-review";
  expectedAnswer?: string;
  expectedSources?: Array<{ assetSha256: string; unitIndex: number; row?: number; version?: string }>;
  tags: string[];
}

export interface KnowledgeEvaluationCorpus {
  version: "knowledge-eval-v3-baseline";
  cases: KnowledgeEvaluationCase[];
}
