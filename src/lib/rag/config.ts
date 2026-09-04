import { getOpenRouterConfig, resolveOpenRouterModel } from "@/providers/openrouter";

export interface RagConfig {
  databaseUrl: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiDefaultHeaders: Record<string, string>;
  openaiProviderPreferences: { require_parameters: true; data_collection: "deny" };
  embeddingApiKey: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  generationModel: string;
  minScore: number;
  maxContextChunks: number;
}

function normalizeGenerationBaseUrl(value: string): string {
  return (value || "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

export function getRagConfig(): RagConfig {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const openRouter = openRouterApiKey ? getOpenRouterConfig() : null;
  const openaiModel = process.env.OPENAI_GENERATION_MODEL?.trim() ?? "";
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
    openaiApiKey: openRouterApiKey,
    openaiBaseUrl: normalizeGenerationBaseUrl(openRouter?.baseUrl ?? ""),
    openaiDefaultHeaders: openRouter?.defaultHeaders ?? {},
    openaiProviderPreferences: openRouter?.providerPreferences
      ?? { require_parameters: true, data_collection: "deny" },
    embeddingApiKey: process.env.EMBEDDING_API_KEY?.trim() ?? "",
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() ?? "",
    embeddingModel: process.env.EMBEDDING_MODEL?.trim() || "text-embedding-v4",
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
    generationModel: resolveOpenRouterModel(openaiModel || "gpt-5-mini", "openai"),
    minScore: Number(process.env.RAG_MIN_SCORE ?? 0.35),
    maxContextChunks: Number(process.env.RAG_MAX_CONTEXT_CHUNKS ?? 8),
  };
}

export function getMissingRagConfig(): string[] {
  const config = getRagConfig();
  return [
    !config.databaseUrl && "DATABASE_URL",
    !config.openaiApiKey && "OPENROUTER_API_KEY",
    !config.embeddingApiKey && "EMBEDDING_API_KEY",
    !config.embeddingBaseUrl && "EMBEDDING_BASE_URL",
  ].filter((value): value is string => Boolean(value));
}
