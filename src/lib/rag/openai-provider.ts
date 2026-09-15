import OpenAI from "openai";
import {textOutputLimit} from "@/lib/billing/text-output-policy";
import {sdkModelFetch,withSdkModelCall} from "@/lib/billing/sdk-model-call";
import { getRagConfig } from "./config";
import type { RetrievedChunk } from "./types";
import {prepareRagExternalDisclosure} from "./external-disclosure";
import {kimiOutputLimit,isKimiK3} from "@/providers/kimi-contract";
import {z} from "zod";

let embeddingClient: OpenAI | undefined;

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

function kimiAnswerEndpoint(baseUrl:string):string{
  const parsed=new URL(baseUrl);
  if(parsed.protocol!=="https:"||!["api.moonshot.cn","api.moonshot.ai"].includes(parsed.hostname)
    ||parsed.username||parsed.password)throw new Error("KIMI_BASE_URL 必须是受信任的 Moonshot HTTPS API 地址");
  return `${parsed.toString().replace(/\/$/,"")}/chat/completions`;
}

const kimiAnswerSchema=z.object({answer:z.string().trim().min(1)}).strict();

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
  const config=getRagConfig();
  if(!config.ragAnswerApiKey)throw new Error("KIMI_API_KEY is not configured");
  const requestBody=JSON.stringify({model:config.ragAnswerModel,...(isKimiK3(config.ragAnswerModel)?{}:{temperature:1}),
    response_format:{type:"json_object"},...kimiOutputLimit(config.ragAnswerModel,textOutputLimit("rag-answer")),messages:[
      {...messages[0],content:`${messages[0].content}\nReturn one JSON object only: {\"answer\":\"complete cited answer\"}.`},messages[1]]});
  const response=await withSdkModelCall({provider:"kimi",task:"rag-answer",promptVersion:"rag-grounded-answer-kimi-v1"},
    ()=>sdkModelFetch(transport)(kimiAnswerEndpoint(config.ragAnswerBaseUrl),{method:"POST",headers:{authorization:`Bearer ${config.ragAnswerApiKey}`,
      "content-type":"application/json"},signal:AbortSignal.timeout(90_000),body:requestBody}));
  const body=await response.json() as {model?:string;choices?:Array<{message?:{content?:string|null}}>;
    error?:{message?:string}};
  if(!response.ok)throw new Error(body.error?.message??`Kimi HTTP ${response.status}`);
  const content=body.choices?.[0]?.message?.content;if(!content)throw new Error("Kimi returned an empty RAG answer");
  let parsed:unknown;try{parsed=JSON.parse(content);}catch{throw new Error("Kimi returned invalid RAG answer JSON");}
  return kimiAnswerSchema.parse(parsed).answer;
}
