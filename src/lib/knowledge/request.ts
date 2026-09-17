import { tenantQuery } from "@/lib/rag/db";
import type { AssistantConversationTurn } from "@/lib/assistant/types";
import type { KnowledgeBaseType } from "@/lib/rag/types";
import { exactModelMentions, resolveAttributeCandidates } from "./query-normalizer";

export type KnowledgeAction = "open-document" | "fact-query" | "compare-facts" | "explain";
export type KnowledgeComparisonMode = "explicit-attributes" | "default-profile";

export interface KnowledgeRequest {
  question: string;
  action: KnowledgeAction;
  entityKeys: string[];
  /** IDs are deliberately resolved later inside ACL-scoped repositories. */
  parsedEntities: Array<{ canonicalKey: string; version?: string }>;
  attributeKeys: string[];
  comparisonMode?: KnowledgeComparisonMode;
  comparisonProfile?: string;
  documentKind?: "datasheet" | "manual" | "original";
  collections?: KnowledgeBaseType[];
  entry: "assistant" | "knowledge-page";
}

const OPEN_PATTERN = /\b(?:open|show|view|download)\b.*\b(?:datasheet|manual|pdf|document)\b|打开|查看|下载|原始资料|原文件|规格书/i;
const COMPARE_PATTERN = /\b(?:compare|comparison|versus|vs\.?|difference|different)\b|区别|差异|不同|对比|比较/i;
const EXPLAIN_PATTERN = /\b(?:why|explain|deployment scenarios?|use cases?|suitable for)\b|为什么|解释|适合什么|部署场景|使用场景|说明依据/i;
const VERSION_PATTERN = /(?:\bversion\s*|\bv(?:er)?\.?\s*|版本\s*)(\d+(?:\.\d+){0,2})\b/i;

export function classifyKnowledgeRequest(input: {
  question: string;
  entityKeys: string[];
  attributeKeys?: string[];
  collections?: KnowledgeBaseType[];
  entry: KnowledgeRequest["entry"];
}): KnowledgeRequest {
  const attributeKeys = input.attributeKeys ?? resolveAttributeCandidates(input.question);
  const version = input.question.match(VERSION_PATTERN)?.[1];
  const action: KnowledgeAction = OPEN_PATTERN.test(input.question)
    ? "open-document"
    : COMPARE_PATTERN.test(input.question) && input.entityKeys.length > 1
      ? "compare-facts"
      : EXPLAIN_PATTERN.test(input.question)
        ? "explain"
      : attributeKeys.length && input.entityKeys.length
        ? "fact-query"
        : "explain";
  return {
    question: input.question,
    action,
    entityKeys: input.entityKeys,
    parsedEntities: input.entityKeys.map((canonicalKey) => ({ canonicalKey, version })),
    attributeKeys,
    comparisonMode: action === "compare-facts"
      ? attributeKeys.length ? "explicit-attributes" : "default-profile"
      : undefined,
    comparisonProfile: action === "compare-facts" && !attributeKeys.length ? "category-default" : undefined,
    documentKind: /manual|手册/i.test(input.question)
      ? "manual"
      : /datasheet|规格书/i.test(input.question) ? "datasheet" : "original",
    collections: input.collections,
    entry: input.entry,
  };
}

export async function parseKnowledgeRequest(userId: string, input: {
  question: string;
  history?: AssistantConversationTurn[];
  collections?: KnowledgeBaseType[];
  entry: KnowledgeRequest["entry"];
}): Promise<KnowledgeRequest> {
  const models = await tenantQuery<{ key: string }>(userId,
    "select canonical_key as key from knowledge_entity where entity_type='product' order by length(canonical_key) desc", []);
  let entityKeys = exactModelMentions(input.question, models.map((row) => row.key));
  if (!entityKeys.length) {
    for (const turn of [...(input.history ?? [])].reverse().slice(0, 6)) {
      entityKeys = exactModelMentions(turn.content, models.map((row) => row.key));
      if (entityKeys.length === 1) break;
      if (entityKeys.length > 1) {
        entityKeys = [];
        break;
      }
    }
  }
  return classifyKnowledgeRequest({ question: input.question, entityKeys, collections: input.collections, entry: input.entry });
}
