import {withProductSpend} from "@/lib/billing/context";
import { getRagConfig } from "./config";
import { embedTexts, generateGroundedAnswer } from "./openai-provider";
import { authorizedKnowledgeChunkIds, hybridSearch, knowledgeRevisionToken, logRagQuery } from "./repository";
import type { RagAnswer, RagQuery } from "./types";
import {trackedOperation} from "@/lib/tracked-operation";
import {prepareRagExternalDisclosure} from "./external-disclosure";
import { validateRagEvidence } from "@/lib/knowledge/evidence-validation";
import { ATTRIBUTE_REGISTRY_VERSION, buildControlledLexicalQuery, normalizeKnowledgeText } from "@/lib/knowledge/query-normalizer";
import { knowledgeCacheKey, withSuccessfulKnowledgeCache } from "@/lib/knowledge/cache";
import { embedTextsWithBge } from "./bge-client";

export function extractCitedChunkIds(answer: string): Set<string> {
  return new Set(Array.from(answer.matchAll(/\[KB:([0-9a-f-]{36})\]/gi)).map((match) => match[1].toLowerCase()));
}

function citationFromChunk(chunk: import("./types").RetrievedChunk): RagAnswer["citations"][number] {
  return {
    chunkId: chunk.id, documentTitle: chunk.title, sourceUrl: chunk.sourceUrl,
    excerpt: chunk.content.slice(0, 260), score: chunk.score, collection: chunk.collection,
    visibility: chunk.visibility, retrievalSignals: chunk.retrievalSignals, corroborated: chunk.corroborated,
    structuredFacts: Array.isArray(chunk.metadata.structuredFacts)
      ? chunk.metadata.structuredFacts as RagAnswer["citations"][number]["structuredFacts"] : [],
    releaseId: typeof chunk.metadata.releaseId === "string" ? chunk.metadata.releaseId : undefined,
    sourceLocation: typeof chunk.metadata.sourceLocation === "object" && chunk.metadata.sourceLocation
      ? chunk.metadata.sourceLocation as Record<string, unknown> : undefined,
    laneRanks: typeof chunk.metadata.laneRanks === "object" && chunk.metadata.laneRanks
      ? chunk.metadata.laneRanks as RagAnswer["citations"][number]["laneRanks"] : undefined,
  };
}

export async function answerWithRag(userId: string, input: RagQuery): Promise<RagAnswer> {
  return trackedOperation(userId,"rag-answer",1,input.question.length,()=>answerWithRagImpl(userId,input),result=>({
    outputItems:1,validOutputItems:result.grounded?1:0,downstreamUsedItems:null,
    usageBoundary:"answer-returned-user-adoption-unknown",discardedReasonCounts:{insufficientGrounding:result.grounded?0:1,
      nonPublicSourceExcluded:result.externalDisclosure?.excludedChunks??0,
      sensitivePatternRedacted:result.externalDisclosure?.redactedPatterns??0},
    optimizationOpportunity:"Reuse retrieved evidence and measure cited passages before increasing retrieval or generation budgets",
  }));
}
async function answerWithRagImpl(userId: string, input: RagQuery): Promise<RagAnswer> {
  const startedAt = Date.now();
  const config = getRagConfig();
  const maxChunks = Math.min(Math.max(input.maxChunks ?? config.maxContextChunks, 1), 12);
  const revision = await knowledgeRevisionToken(userId);
  const qwenEmbedding = config.embeddingApiKey && config.embeddingBaseUrl
    ? await withSuccessfulKnowledgeCache({
    key: knowledgeCacheKey("query-embedding-qwen", {
      userId, question: normalizeKnowledgeText(input.question), filters: input.filters ?? {}, revision,
      aliases: ATTRIBUTE_REGISTRY_VERSION, model: config.embeddingModel, dimensions: config.embeddingDimensions,
    }),
    ttlMs: 10 * 60_000,
    load: async () => (await withProductSpend(userId,"rag-query-embedding",()=>embedTexts([input.question])))[0],
  }).catch(() => null) : null;
  const bgeEmbedding = await withSuccessfulKnowledgeCache({
    key: knowledgeCacheKey("query-embedding-bge", {
      userId, question: normalizeKnowledgeText(input.question), filters: input.filters ?? {}, releaseRevision: revision,
      aliases: ATTRIBUTE_REGISTRY_VERSION, model: "BAAI/bge-m3",
      modelRevision: "5617a9f61b028005a4858fdac845db406aefb181", dimensions: 1024,
    }),
    ttlMs: 10 * 60_000,
    load: async () => (await embedTextsWithBge([input.question]))[0],
  }).catch(() => null);
  const degradedLanes: Array<"qwen" | "bge"> = [];
  if (!qwenEmbedding) degradedLanes.push("qwen");
  if (!bgeEmbedding) degradedLanes.push("bge");
  const evidenceResult = await withSuccessfulKnowledgeCache({
    key: knowledgeCacheKey("evidence", {
      userId, question: normalizeKnowledgeText(input.question), filters: input.filters ?? {}, maxChunks,
      revision, aliases: ATTRIBUTE_REGISTRY_VERSION, model: config.embeddingModel,
      qwenAvailable: Boolean(qwenEmbedding), bgeAvailable: Boolean(bgeEmbedding),
    }),
    ttlMs: 2 * 60_000,
    load: () => hybridSearch(userId, input.question, qwenEmbedding?.value ?? null, {
    ...input.filters,
    lexicalQuery: buildControlledLexicalQuery(input.question),
    }, maxChunks, bgeEmbedding?.value ?? null),
    shouldCache: (value) => value.length > 0,
  });
  let retrieved = evidenceResult.value;
  if (evidenceResult.cacheHit) {
    const authorized = await authorizedKnowledgeChunkIds(userId, retrieved.map((chunk) => chunk.id));
    retrieved = retrieved.filter((chunk) => authorized.has(chunk.id));
  }
  const chunks = retrieved.filter((chunk) => chunk.score >= config.minScore);
  const warnings: string[] = [];
  if (degradedLanes.length) warnings.push(`检索通道降级：${degradedLanes.join("、")}；其余事实、全文或向量通道仍在运行。`);

  if (chunks.length === 0) {
    warnings.push("没有检索到达到置信阈值的知识片段。请补充知识库或放宽过滤条件。");
    return {
      answer: "当前知识库没有足够证据回答这个问题。请补充相关行业、公司或产品资料后重试。",
      citations: [], grounded: false, model: config.ragAnswerModel,
      latencyMs: Date.now() - startedAt, warnings,
      degradedLanes, generationUsed: false,
      reasonCode: degradedLanes.length === 2 ? "embedding-lane-unavailable" : "retrieval-no-match",
      cache: { embeddingHit: Boolean(qwenEmbedding?.cacheHit || bgeEmbedding?.cacheHit), evidenceHit: evidenceResult.cacheHit },
    };
  }

  const disclosure=prepareRagExternalDisclosure(input.question,chunks);
  if(disclosure.excludedChunks>0)warnings.push(`${disclosure.excludedChunks} 个非公开来源知识片段未发送至外部回答模型。`);
  if(disclosure.redactionCount>0)warnings.push(`外发副本已移除 ${disclosure.redactionCount} 处敏感信息形态。`);
  if(disclosure.chunks.length===0){
    warnings.push("命中知识没有明确公开来源标记，未发送至外部回答模型。");
    return {answer:"已在本地权限范围内找到相关资料，但这些证据不允许外发，因此未调用外部回答模型。可直接查看下方原始证据。",
      citations:chunks.map(citationFromChunk),grounded:false,model:config.ragAnswerModel,latencyMs:Date.now()-startedAt,warnings,
      externalDisclosure:{excludedChunks:disclosure.excludedChunks,redactedPatterns:disclosure.redactionCount},
      degradedLanes,generationUsed:false,reasonCode:"external-disclosure-blocked",
      cache:{embeddingHit:Boolean(qwenEmbedding?.cacheHit||bgeEmbedding?.cacheHit),evidenceHit:evidenceResult.cacheHit}};
  }
  const answer = await withProductSpend(userId,"rag-grounded-answer",()=>generateGroundedAnswer(disclosure.question, disclosure.chunks));
  const citedIds = extractCitedChunkIds(answer);
  const validation = validateRagEvidence({
    citedIds,
    availableChunks: disclosure.chunks,
    expectedProductId: input.filters?.productId,
  });
  if (validation.reasons.includes("empty-citations")) warnings.push("模型答案缺少有效 chunk 引用，请人工复核。");
  if (validation.reasons.includes("unknown-citation")) warnings.push("模型答案包含不在本次证据集中的引用，已拒绝视为已溯源。");
  if (validation.reasons.includes("missing-verified-property")) warnings.push("产品引用仅含身份或未验证事实，不能证明所问属性。");
  if (validation.reasons.includes("wrong-product")) warnings.push("产品引用与请求型号不一致，已拒绝视为已验证规格。");
  if (!validation.grounded) warnings.push("回答已降级为未充分溯源状态。");
  const citations = validation.citedChunks.map(citationFromChunk);
  const citedProductChunks = validation.citedChunks.filter((chunk) => chunk.collection === "product");
  if (citedProductChunks.some((chunk) => !chunk.corroborated || !chunk.retrievalSignals.includes("structured"))) {
    warnings.push("部分产品结论缺少结构化事实交叉印证，已标记为低置信度，不能视为已验证规格。");
  }
  if (citedProductChunks.some((chunk) => Array.isArray(chunk.metadata.structuredFacts)
    && (chunk.metadata.structuredFacts as Array<{ status?: string }>).some((fact) => fact.status === "conflicting"))) {
    warnings.push("结构化产品事实存在冲突；冲突项不得用于自动决策。");
  }
  const latencyMs = Date.now() - startedAt;
  await logRagQuery({
    userId,
    queryText: input.question,
    collections: input.filters?.collections ?? ["industry", "company", "product"],
    filters: input.filters ?? {}, chunkIds: chunks.map((chunk) => chunk.id), answer,
    embeddingModel: config.embeddingModel, generationModel: config.ragAnswerModel, latencyMs,
  }).catch(() => warnings.push("查询日志写入失败，但不影响本次答案。"));

  const grounded = validation.grounded;
  return { answer, citations, grounded, model: config.ragAnswerModel, latencyMs, warnings, degradedLanes,
    generationUsed:true,reasonCode:grounded?"ok":"fact-not-verified",
    externalDisclosure:{excludedChunks:disclosure.excludedChunks,redactedPatterns:disclosure.redactionCount},
    cache:{embeddingHit:Boolean(qwenEmbedding?.cacheHit||bgeEmbedding?.cacheHit),evidenceHit:evidenceResult.cacheHit} };
}
