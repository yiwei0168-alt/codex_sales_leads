export interface RagConfig {
  databaseUrl: string;
  openaiApiKey: string;
  embeddingModel: string;
  generationModel: string;
  minScore: number;
  maxContextChunks: number;
}

export function getRagConfig(): RagConfig {
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
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
  ].filter((value): value is string => Boolean(value));
}
