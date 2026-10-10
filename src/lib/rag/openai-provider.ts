import {textOutputLimit} from "@/lib/billing/text-output-policy";
import {sdkModelFetch,withSdkModelCall} from "@/lib/billing/sdk-model-call";
import { getRagConfig } from "./config";
import type { RetrievedChunk } from "./types";
import {prepareRagExternalDisclosure} from "./external-disclosure";
import {kimiOutputLimit,isKimiK3} from "@/providers/kimi-contract";
import {z} from "zod";
import { getOpenRouterConfig, openRouterChatCompletionsUrl, openRouterRequestHeaders } from "@/providers/openrouter";
import { RemoteEmbeddingRetiredError } from "./embedding-contract";

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

export async function embedTextsWithUsage(inputs: string[], transport: typeof fetch = fetch): Promise<{
  embeddings: number[][];
  usage: EmbeddingCallUsage[];
}> {
  if (inputs.length === 0) return { embeddings: [], usage: [] };
  void transport;
  throw new RemoteEmbeddingRetiredError();
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

const kimiAnswerSchema=z.object({answer:z.string().trim().min(1)}).strict();

/** Exact body inspection lets a scoped evaluation fail before a payable request. */
export function groundedAnswerRequestBody(question:string,chunks:RetrievedChunk[]):string{
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
  return JSON.stringify({model:config.ragAnswerModel,...(isKimiK3(config.ragAnswerModel)?{}:{temperature:1}),
    provider:{...config.openaiProviderPreferences,allow_fallbacks:false},
    response_format:{type:"json_object"},...kimiOutputLimit(config.ragAnswerModel,textOutputLimit("rag-answer")),messages:[
      {...messages[0],content:`${messages[0].content}\nReturn one JSON object only: {\"answer\":\"complete cited answer\"}.`},messages[1]]});
}

export async function generateGroundedAnswer(question: string, chunks: RetrievedChunk[],transport:typeof fetch=fetch,
  timeoutMs=90_000): Promise<string> {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1_000||timeoutMs>180_000)throw new Error("RAG answer timeout is out of bounds");
  const requestBody=groundedAnswerRequestBody(question,chunks);
  const config=getOpenRouterConfig();
  const response=await withSdkModelCall({provider:"openrouter",task:"rag-answer",promptVersion:"rag-grounded-answer-kimi-v1"},
    ()=>sdkModelFetch(transport)(openRouterChatCompletionsUrl(config),{method:"POST",headers:openRouterRequestHeaders(config),
      redirect:"error",signal:AbortSignal.timeout(timeoutMs),body:requestBody}));
  if(!response.ok)throw new Error(`OpenRouter Kimi HTTP ${response.status}`);
  const body=await response.json() as {model?:string;choices?:Array<{finish_reason?:string;message?:{content?:string|null}}>;
    error?:{message?:string}};
  if(body.choices?.[0]?.finish_reason!=="stop")throw new Error("Kimi returned an incomplete RAG answer");
  const content=body.choices?.[0]?.message?.content;if(!content)throw new Error("Kimi returned an empty RAG answer");
  let parsed:unknown;try{parsed=JSON.parse(content);}catch{throw new Error("Kimi returned invalid RAG answer JSON");}
  return kimiAnswerSchema.parse(parsed).answer;
}
