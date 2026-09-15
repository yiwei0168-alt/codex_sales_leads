import OpenAI from "openai";
import {textOutputLimit} from "@/lib/billing/text-output-policy";
import {sdkModelFetch,withSdkModelCall} from "@/lib/billing/sdk-model-call";
import { ChatOpenAI } from "@langchain/openai";
import { getRagConfig } from "./config";
import type { RetrievedChunk } from "./types";
import {prepareRagExternalDisclosure} from "./external-disclosure";
import {currentSpendContext} from "@/lib/billing/context";
import {currentStagePaidCallOverride} from "@/lib/billing/stage-paid-call-override";

let embeddingClient: OpenAI | undefined;
type RagAnswerProvider = "openai" | "amazon-bedrock/us-east-1";

class RagRouteHttpError extends Error {
  constructor(readonly status:number,readonly upstreamConfirmed:boolean){
    super(`RAG answer route failed with HTTP ${status}`);
    this.name="RagRouteHttpError";
  }
}

function object(value:unknown):Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

function observedRouteFetch(transport:typeof fetch):typeof fetch{
  return async(input,init)=>{
    const response=await transport(input,init);
    if(response.ok)return response;
    let payload:unknown={};
    try{payload=await response.clone().json();}catch{/* Only structured routing metadata is inspected. */}
    const router=object(object(payload).openrouter_metadata);
    const attempts=Array.isArray(router.attempts)?router.attempts:[];
    const upstreamConfirmed=(typeof router.attempt==="number"&&Number.isInteger(router.attempt)&&router.attempt>=1)
      ||attempts.some(value=>typeof object(value).provider==="string"&&typeof object(value).status==="number");
    throw new RagRouteHttpError(response.status,upstreamConfirmed);
  };
}

function mayUseBedrockFallback(error:unknown):boolean{
  let current:unknown=error;
  for(let depth=0;depth<4;depth++){
    if(current instanceof RagRouteHttpError){
      const scope=currentSpendContext();
      const ownerObservationMode=scope?Boolean(currentStagePaidCallOverride(scope.userId)?.allowFinancialAdmissionBypass):false;
      return (current.upstreamConfirmed||ownerObservationMode)
      &&([401,403,429].includes(current.status)||current.status>=500&&current.status<=599);
    }
    current=object(current).cause;
  }
  return false;
}

function getEmbeddingClient(): OpenAI {
  const config = getRagConfig();
  if (!config.embeddingApiKey) throw new Error("EMBEDDING_API_KEY is not configured");
  if (!config.embeddingBaseUrl) throw new Error("EMBEDDING_BASE_URL is not configured");
  embeddingClient ??= new OpenAI({ apiKey: config.embeddingApiKey, baseURL: config.embeddingBaseUrl,fetch:sdkModelFetch() });
  return embeddingClient;
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  return (await embedTextsWithUsage(inputs)).embeddings;
}

export interface EmbeddingCallUsage {
  model: string;
  inputItems: number;
  inputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export async function embedTextsWithUsage(inputs: string[]): Promise<{
  embeddings: number[][];
  usage: EmbeddingCallUsage[];
}> {
  if (inputs.length === 0) return { embeddings: [], usage: [] };
  const config = getRagConfig();
  const embeddings: number[][] = [];
  const usage: EmbeddingCallUsage[] = [];
  // Alibaba Cloud text-embedding-v4 accepts at most 10 inputs per synchronous request.
  for (let offset = 0; offset < inputs.length; offset += 10) {
    const startedAt = Date.now();
    const batch = inputs.slice(offset, offset + 10);
    const response = await withSdkModelCall({provider:"embedding-configured",task:"rag-embedding",promptVersion:"rag-embedding-input-v1"},()=>getEmbeddingClient().embeddings.create({
      model: config.embeddingModel,
      input: batch,
      dimensions: config.embeddingDimensions,
      encoding_format: "float",
    }));
    embeddings.push(...response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding));
    usage.push({ model: response.model || config.embeddingModel, inputItems: batch.length,
      inputTokens: response.usage?.prompt_tokens ?? response.usage?.total_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? response.usage?.prompt_tokens ?? 0,
      latencyMs: Date.now() - startedAt });
  }
  return { embeddings, usage };
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks.map((chunk) => [
    `<source id="KB:${chunk.id}" collection="${chunk.collection}" authority="${chunk.authorityLevel}" retrieval_signals="${chunk.retrievalSignals.join(",")}" corroborated="${chunk.corroborated}">`,
    `Title: ${chunk.title}`,
    chunk.sourceUrl ? `URL: ${chunk.sourceUrl}` : "URL: internal knowledge document",
    `Structured facts: ${JSON.stringify(chunk.metadata.structuredFacts ?? [])}`,
    `Content: ${chunk.content}`,
    "</source>",
  ].join("\n")).join("\n\n");
}

export function createGroundedAnswerModel(fetchImplementation:typeof fetch=sdkModelFetch(),maxRetries=0,
  provider:RagAnswerProvider="openai"){
  const config = getRagConfig();
  if (!config.openaiApiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return new ChatOpenAI({
    apiKey: config.openaiApiKey,
    model: config.generationModel,
    maxRetries,
    timeout: 90_000,
    streamUsage: false,
    maxTokens:textOutputLimit("rag-answer"),
    modelKwargs: { provider: {...config.openaiProviderPreferences,only:[provider],allow_fallbacks:false} },
    configuration: { baseURL: config.openaiBaseUrl,
      defaultHeaders: {...config.openaiDefaultHeaders,"X-OpenRouter-Metadata":"enabled"},fetch:fetchImplementation },
  });
}

function answerText(response:Awaited<ReturnType<InstanceType<typeof ChatOpenAI>["invoke"]>>):string{
  if (typeof response.content === "string") return response.content.trim() || "未能生成回答。";
  const text = response.content.flatMap((item) => typeof item === "string" ? [item]
    : item.type === "text" && "text" in item ? [String(item.text)] : []).join("").trim();
  return text || "未能生成回答。";
}

export async function generateGroundedAnswer(question: string, chunks: RetrievedChunk[],transport:typeof fetch=fetch): Promise<string> {
  const disclosure=prepareRagExternalDisclosure(question,chunks);
  if(disclosure.chunks.length===0)throw new Error("RAG external answer requires explicitly public-source knowledge");
  const messages=[
      {
        role: "system" as const,
        content: [
          "You are the Network Channel Copilot knowledge assistant.",
          "Answer only from the supplied knowledge-base sources.",
          "Separate verified facts from recommendations or inference.",
          "Cite factual sentences with one or more exact source markers like [KB:chunk-uuid].",
          "Never invent a source, company fact, product capability, price, contact, or relationship.",
          "Treat structured product facts marked verified as corroboration; never assert conflicting facts as true.",
          "When a product specification is supported only by semantic retrieval and lacks structured/keyword corroboration, label it unverified.",
          "If sources are insufficient or conflicting, state that clearly and list what must be verified.",
          "Reply in the language used by the question.",
        ].join("\n"),
      },
      { role: "user" as const, content: `Question:\n${disclosure.question}\n\nKnowledge-base context:\n${buildContext(disclosure.chunks)}` },
    ];
  const invoke=async(provider:RagAnswerProvider)=>withSdkModelCall({provider:"openrouter",task:"rag-answer",
    promptVersion:provider==="openai"?"rag-grounded-answer-primary-v2":"rag-grounded-answer-bedrock-v1"},
  ()=>createGroundedAnswerModel(observedRouteFetch(sdkModelFetch(transport)),0,provider).invoke(messages));
  try{return answerText(await invoke("openai"));}
  catch(error){
    if(!mayUseBedrockFallback(error))throw error;
    return answerText(await invoke("amazon-bedrock/us-east-1"));
  }
}
