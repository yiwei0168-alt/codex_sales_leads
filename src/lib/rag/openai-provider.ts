import OpenAI from "openai";
import { ChatOpenAI } from "@langchain/openai";
import { getRagConfig } from "./config";
import type { RetrievedChunk } from "./types";

let embeddingClient: OpenAI | undefined;

function getEmbeddingClient(): OpenAI {
  const config = getRagConfig();
  if (!config.embeddingApiKey) throw new Error("EMBEDDING_API_KEY is not configured");
  if (!config.embeddingBaseUrl) throw new Error("EMBEDDING_BASE_URL is not configured");
  embeddingClient ??= new OpenAI({ apiKey: config.embeddingApiKey, baseURL: config.embeddingBaseUrl });
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
    const response = await getEmbeddingClient().embeddings.create({
      model: config.embeddingModel,
      input: batch,
      dimensions: config.embeddingDimensions,
      encoding_format: "float",
    });
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

export async function generateGroundedAnswer(question: string, chunks: RetrievedChunk[]): Promise<string> {
  const config = getRagConfig();
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY or LINGYU_API_KEY is not configured");
  const model = new ChatOpenAI({
    apiKey: config.openaiApiKey,
    model: config.generationModel,
    temperature: 0,
    maxRetries: 2,
    timeout: 90_000,
    streamUsage: false,
    configuration: { baseURL: config.openaiBaseUrl },
  });
  const response = await model.invoke([
      {
        role: "system",
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
      { role: "user", content: `Question:\n${question}\n\nKnowledge-base context:\n${buildContext(chunks)}` },
    ]);
  if (typeof response.content === "string") return response.content.trim() || "未能生成回答。";
  const text = response.content.flatMap((item) => typeof item === "string" ? [item]
    : item.type === "text" && "text" in item ? [String(item.text)] : []).join("").trim();
  return text || "未能生成回答。";
}
