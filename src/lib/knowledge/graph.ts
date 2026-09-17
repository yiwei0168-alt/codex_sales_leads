import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { AssistantConversationTurn } from "@/lib/assistant/types";
import { getMissingRagConfig } from "@/lib/rag/config";
import { tenantQuery } from "@/lib/rag/db";
import { answerWithRag } from "@/lib/rag/service";
import type { KnowledgeBaseType } from "@/lib/rag/types";
import { resolveVerifiedFacts } from "./fact-repository";
import { parseKnowledgeRequest, type KnowledgeRequest } from "./request";
import { baseKnowledgeResult, type KnowledgeResult } from "./response";

const KnowledgeState = Annotation.Root({
  userId: Annotation<string>(),
  question: Annotation<string>(),
  history: Annotation<AssistantConversationTurn[]>(),
  collections: Annotation<KnowledgeBaseType[] | undefined>(),
  entry: Annotation<"assistant" | "knowledge-page">(),
  request: Annotation<KnowledgeRequest | undefined>(),
  result: Annotation<KnowledgeResult | undefined>(),
  started: Annotation<number>(),
});

async function documentResult(userId: string, request: KnowledgeRequest, started: number): Promise<KnowledgeResult> {
  if (request.entityKeys.length !== 1) {
    return baseKnowledgeResult(started, {
      kind: "clarification",
      reasonCode: request.entityKeys.length ? "entity-ambiguous" : "entity-missing",
      answer: "请明确要打开哪个产品或实体的资料。",
    });
  }

  const rows = await tenantQuery<{
    assetId: string; title: string; documentType: string; version: string | null; mimeType: string;
  }>(userId, `select a.id as "assetId", d.title, a.document_type as "documentType",
                     a.document_version as version, a.mime_type as "mimeType"
                from knowledge_entity e
                join knowledge_document_entity de on de.entity_id = e.id
                join knowledge_document d on d.id = de.document_id
                join knowledge_asset a on a.document_id = d.id
               where lower(e.canonical_key) = lower($1)
                 and a.registration_status = 'registered'
                 and (d.visibility = 'shared' or d.owner_id = $2)
                 and ($3 <> 'datasheet' or (lower(a.document_type) = 'pdf' and a.source_nature ilike '%datasheet%'))
               order by a.document_version desc nulls last, a.updated_at desc`, [
    request.entityKeys[0], userId, request.documentKind ?? "original",
  ]);

  if (!rows.length) {
    return baseKnowledgeResult(started, {
      kind: "insufficient-evidence", reasonCode: "document-not-found", answer: "没有找到可访问的已登记原始资料。",
    });
  }
  return baseKnowledgeResult(started, {
    kind: "document-links",
    reasonCode: "ok",
    answer: rows.length === 1 ? "已找到原始资料，可直接打开。" : "找到多个资料版本，请选择需要打开的版本。",
    documents: rows.map((row) => ({
      assetId: row.assetId, title: row.title, documentType: row.documentType,
      version: row.version ?? undefined, mimeType: row.mimeType, url: `/api/knowledge/assets/${row.assetId}`,
    })),
  });
}

async function factResult(userId: string, request: KnowledgeRequest, started: number): Promise<KnowledgeResult> {
  if (!request.entityKeys.length) {
    return baseKnowledgeResult(started, { kind: "clarification", reasonCode: "entity-missing", answer: "请明确要查询的产品或实体。" });
  }
  if (!request.attributeKeys.length) {
    return baseKnowledgeResult(started, { kind: "clarification", reasonCode: "attribute-missing", answer: "请明确要查询的规格属性。" });
  }

  const answers: string[] = [];
  const citations: KnowledgeResult["factCitations"] = [];
  for (const entity of request.entityKeys) {
    const facts = await resolveVerifiedFacts(userId, entity, request.attributeKeys);
    for (const attribute of request.attributeKeys) {
      const matching = facts.filter((item) => item.attributeKey === attribute);
      if (matching.some((item) => item.status === "conflicting")) {
        return baseKnowledgeResult(started, {
          kind: "clarification", reasonCode: "version-conflict",
          answer: `${entity} 的 ${attribute} 存在版本或来源冲突，请先选择资料版本。`,
          factCitations: matching.map((item) => ({
            factId: item.id, attributeKey: item.attributeKey, assetId: item.assetId,
            version: item.documentVersion ?? undefined, status: item.status, rawValue: item.rawValue,
          })),
        });
      }
      const verified = matching.filter((item) => item.status === "verified");
      const values = [...new Set(verified.map((item) => JSON.stringify(item.typedValue)))];
      if (values.length !== 1) {
        return baseKnowledgeResult(started, {
          kind: "insufficient-evidence", reasonCode: "fact-not-verified",
          answer: `${entity} 的 ${attribute} 暂无唯一且已验证的事实。`,
        });
      }
      const value = verified[0].typedValue;
      answers.push(`${entity} · ${attribute}: ${typeof value === "string" ? value : JSON.stringify(value)}${verified[0].unit ? ` ${verified[0].unit}` : ""}`);
      citations.push(...verified.map((item) => ({
        factId: item.id, attributeKey: item.attributeKey, assetId: item.assetId,
        version: item.documentVersion ?? undefined, status: item.status, rawValue: item.rawValue,
      })));
    }
  }
  return baseKnowledgeResult(started, { kind: "fact-answer", reasonCode: "ok", answer: answers.join("\n"), factCitations: citations });
}

export function buildKnowledgeGraph() {
  return new StateGraph(KnowledgeState)
    .addNode("classify_knowledge_request", async (state) => ({
      started: state.started || Date.now(),
      request: await parseKnowledgeRequest(state.userId, {
        question: state.question, history: state.history, collections: state.collections, entry: state.entry,
      }),
    }))
    .addNode("open_registered_document", async (state) => ({ result: await documentResult(state.userId, state.request!, state.started) }))
    .addNode("read_verified_facts", async (state) => ({ result: await factResult(state.userId, state.request!, state.started) }))
    .addNode("generate_grounded_explanation", async (state) => {
      const missing = getMissingRagConfig();
      if (missing.length) {
        return { result: baseKnowledgeResult(state.started, {
          kind: "unavailable", reasonCode: "rag-required", answer: `复杂解释需要 RAG 配置：${missing.join(", ")}`,
        }) };
      }
      const rag = await answerWithRag(state.userId, {
        question: state.question, filters: { collections: state.collections }, maxChunks: 8,
      });
      return { result: baseKnowledgeResult(state.started, {
        kind: "generated-answer", reasonCode: rag.grounded ? "ok" : "fact-not-verified",
        answer: rag.answer, ragAnswer: rag, usage: { intentCalls: 0, embeddingCalls: 1, generationCalls: 1 },
      }) };
    })
    .addEdge(START, "classify_knowledge_request")
    .addConditionalEdges("classify_knowledge_request", (state) => {
      if (state.request?.action === "open-document") return "open_registered_document";
      if (state.request?.action === "fact-query" || state.request?.action === "compare-facts") return "read_verified_facts";
      return "generate_grounded_explanation";
    })
    .addEdge("open_registered_document", END)
    .addEdge("read_verified_facts", END)
    .addEdge("generate_grounded_explanation", END)
    .compile({
      name: "knowledge_business_flow",
      description: "Document access, verified fact answers, and generated explanations with explicit branches.",
    });
}

export const knowledgeBusinessGraph = buildKnowledgeGraph();

export async function executeKnowledgeWorkflow(userId: string, input: {
  question: string; history?: AssistantConversationTurn[]; collections?: KnowledgeBaseType[]; entry: "assistant" | "knowledge-page";
}) {
  const state = await knowledgeBusinessGraph.invoke({ userId, ...input, history: input.history ?? [], started: Date.now() });
  if (!state.result) throw new Error("Knowledge workflow returned no result");
  return state.result;
}
