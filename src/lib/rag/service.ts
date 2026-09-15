import {withProductSpend} from "@/lib/billing/context";
import { getRagConfig } from "./config";
import { embedTexts, generateGroundedAnswer } from "./openai-provider";
import { hybridSearch, logRagQuery } from "./repository";
import type { RagAnswer, RagQuery } from "./types";
import {trackedOperation} from "@/lib/tracked-operation";
import {prepareRagExternalDisclosure} from "./external-disclosure";

export function extractCitedChunkIds(answer: string): Set<string> {
  return new Set(Array.from(answer.matchAll(/\[KB:([0-9a-f-]{36})\]/gi)).map((match) => match[1].toLowerCase()));
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
  const [embedding] = await withProductSpend(userId,"rag-query-embedding",()=>embedTexts([input.question]));
  const retrieved = await hybridSearch(userId, input.question, embedding, input.filters, maxChunks);
  const chunks = retrieved.filter((chunk) => chunk.score >= config.minScore);
  const warnings: string[] = [];

  if (chunks.length === 0) {
    warnings.push("没有检索到达到置信阈值的知识片段。请补充知识库或放宽过滤条件。");
    return {
      answer: "当前知识库没有足够证据回答这个问题。请补充相关行业、公司或产品资料后重试。",
      citations: [], grounded: false, model: config.ragAnswerModel,
      latencyMs: Date.now() - startedAt, warnings,
    };
  }

  const disclosure=prepareRagExternalDisclosure(input.question,chunks);
  if(disclosure.excludedChunks>0)warnings.push(`${disclosure.excludedChunks} 个非公开来源知识片段未发送至外部回答模型。`);
  if(disclosure.redactionCount>0)warnings.push(`外发副本已移除 ${disclosure.redactionCount} 处敏感信息形态。`);
  if(disclosure.chunks.length===0){
    warnings.push("命中知识没有明确公开来源标记，未发送至外部回答模型。");
    return {answer:"当前命中的知识片段不满足公开来源外发条件，无法调用外部模型生成答案。请使用公开来源资料，或在本地查看原始知识。",
      citations:[],grounded:false,model:config.ragAnswerModel,latencyMs:Date.now()-startedAt,warnings,
      externalDisclosure:{excludedChunks:disclosure.excludedChunks,redactedPatterns:disclosure.redactionCount}};
  }
  const answer = await withProductSpend(userId,"rag-grounded-answer",()=>generateGroundedAnswer(disclosure.question, disclosure.chunks));
  const citedIds = extractCitedChunkIds(answer);
  if (citedIds.size === 0) {
    warnings.push("模型答案缺少有效 chunk 引用，请人工复核。");
    warnings.push("回答已降级为未充分溯源状态。");
  }
  const citations = disclosure.chunks.filter((chunk) => citedIds.has(chunk.id)).map((chunk) => ({
    chunkId: chunk.id, documentTitle: chunk.title, sourceUrl: chunk.sourceUrl,
    excerpt: chunk.content.slice(0, 260), score: chunk.score, collection: chunk.collection,
    visibility: chunk.visibility,
    retrievalSignals: chunk.retrievalSignals,
    corroborated: chunk.corroborated,
    structuredFacts: Array.isArray(chunk.metadata.structuredFacts)
      ? chunk.metadata.structuredFacts as RagAnswer["citations"][number]["structuredFacts"] : [],
  }));
  const citedProductChunks = disclosure.chunks.filter((chunk) => chunk.collection === "product" && citedIds.has(chunk.id));
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

  const grounded = citedIds.size > 0 && citedProductChunks.every((chunk) => chunk.corroborated
    && chunk.retrievalSignals.includes("structured"));
  return { answer, citations, grounded, model: config.ragAnswerModel, latencyMs, warnings,
    externalDisclosure:{excludedChunks:disclosure.excludedChunks,redactedPatterns:disclosure.redactionCount} };
}
