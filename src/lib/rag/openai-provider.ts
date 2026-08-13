import OpenAI from "openai";
import { getRagConfig } from "./config";
import type { RetrievedChunk } from "./types";

let generationClient: OpenAI | undefined;
let embeddingClient: OpenAI | undefined;

function getGenerationClient(): OpenAI {
  const config = getRagConfig();
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  generationClient ??= new OpenAI({ apiKey: config.openaiApiKey, baseURL: config.openaiBaseUrl });
  return generationClient;
}

function getEmbeddingClient(): OpenAI {
  const config = getRagConfig();
  if (!config.embeddingApiKey) throw new Error("EMBEDDING_API_KEY is not configured");
  if (!config.embeddingBaseUrl) throw new Error("EMBEDDING_BASE_URL is not configured");
  embeddingClient ??= new OpenAI({ apiKey: config.embeddingApiKey, baseURL: config.embeddingBaseUrl });
  return embeddingClient;
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const config = getRagConfig();
  const response = await getEmbeddingClient().embeddings.create({
    model: config.embeddingModel,
    input: inputs,
    dimensions: config.embeddingDimensions,
    encoding_format: "float",
  });
  return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks.map((chunk) => [
    `<source id="KB:${chunk.id}" collection="${chunk.collection}" authority="${chunk.authorityLevel}">`,
    `Title: ${chunk.title}`,
    chunk.sourceUrl ? `URL: ${chunk.sourceUrl}` : "URL: internal knowledge document",
    `Content: ${chunk.content}`,
    "</source>",
  ].join("\n")).join("\n\n");
}

export async function generateGroundedAnswer(question: string, chunks: RetrievedChunk[]): Promise<string> {
  const config = getRagConfig();
  const response = await getGenerationClient().responses.create({
    model: config.generationModel,
    store: false,
    instructions: [
      "You are the Network Channel Copilot knowledge assistant.",
      "Answer only from the supplied knowledge-base sources.",
      "Separate verified facts from recommendations or inference.",
      "Cite factual sentences with one or more exact source markers like [KB:chunk-uuid].",
      "Never invent a source, company fact, product capability, price, contact, or relationship.",
      "If sources are insufficient or conflicting, state that clearly and list what must be verified.",
      "Reply in the language used by the question.",
    ].join("\n"),
    input: `Question:\n${question}\n\nKnowledge-base context:\n${buildContext(chunks)}`,
  });
  return response.output_text.trim();
}
