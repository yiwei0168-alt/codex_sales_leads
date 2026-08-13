export interface RagConfig {
  databaseUrl: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  embeddingApiKey: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  generationModel: string;
  minScore: number;
  maxContextChunks: number;
}

export function getRagConfig(): RagConfig {
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    embeddingApiKey: process.env.EMBEDDING_API_KEY?.trim() ?? "",
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() ?? "",
    embeddingModel: process.env.EMBEDDING_MODEL?.trim() || "text-embedding-v4",
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
    generationModel: process.env.OPENAI_GENERATION_MODEL?.trim() || "gpt-5-mini",
    minScore: Number(process.env.RAG_MIN_SCORE ?? 0.35),
    maxContextChunks: Number(process.env.RAG_MAX_CONTEXT_CHUNKS ?? 8),
  };
}

export function getMissingRagConfig(): string[] {
  const config = getRagConfig();
  return [
    !config.databaseUrl && "DATABASE_URL",
    !config.openaiApiKey && "OPENAI_API_KEY",
    !config.embeddingApiKey && "EMBEDDING_API_KEY",
    !config.embeddingBaseUrl && "EMBEDDING_BASE_URL",
  ].filter((value): value is string => Boolean(value));
}
