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

function normalizeGenerationBaseUrl(value: string): string {
  const baseUrl = value || "https://api.openai.com/v1";
  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname === "lingyuapi.com" && (parsed.pathname === "" || parsed.pathname === "/")) {
      parsed.pathname = "/v1";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    // Let the provider return its normal URL validation error.
  }
  return baseUrl.replace(/\/$/, "");
}

export function getRagConfig(): RagConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const openaiBaseUrl = process.env.OPENAI_BASE_URL?.trim() ?? "";
  const openaiModel = process.env.OPENAI_GENERATION_MODEL?.trim() ?? "";
  const lingyuApiKey = process.env.LINGYU_API_KEY?.trim() ?? "";
  const kimiApiKey = process.env.KIMI_API_KEY?.trim() ?? "";
  const kimiBaseUrl = process.env.KIMI_BASE_URL?.trim() ?? "";
  const kimiModel = process.env.KIMI_MODEL?.trim() ?? "";
  const lingyuGenerationBase = lingyuApiKey
    ? (/lingyuapi\.com/i.test(openaiBaseUrl) ? openaiBaseUrl : "https://lingyuapi.com/v1")
    : openaiBaseUrl;
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
    openaiApiKey: lingyuApiKey || openaiApiKey || kimiApiKey,
    openaiBaseUrl: normalizeGenerationBaseUrl(lingyuGenerationBase || kimiBaseUrl),
    embeddingApiKey: process.env.EMBEDDING_API_KEY?.trim() ?? "",
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() ?? "",
    embeddingModel: process.env.EMBEDDING_MODEL?.trim() || "text-embedding-v4",
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
    generationModel: openaiModel || kimiModel || "gpt-5-mini",
    minScore: Number(process.env.RAG_MIN_SCORE ?? 0.35),
    maxContextChunks: Number(process.env.RAG_MAX_CONTEXT_CHUNKS ?? 8),
  };
}

export function getMissingRagConfig(): string[] {
  const config = getRagConfig();
  return [
    !config.databaseUrl && "DATABASE_URL",
    !config.openaiApiKey && "OPENAI_API_KEY 或 KIMI_API_KEY",
    !config.embeddingApiKey && "EMBEDDING_API_KEY",
    !config.embeddingBaseUrl && "EMBEDDING_BASE_URL",
  ].filter((value): value is string => Boolean(value));
}
