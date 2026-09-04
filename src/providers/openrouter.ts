export type OpenRouterModelFamily = "openai" | "anthropic";

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  defaultHeaders: Record<string, string>;
  providerPreferences: {
    require_parameters: true;
    data_collection: "deny";
  };
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_APP_TITLE = "Cudy Network Channel Copilot";

function validatedBaseUrl(value: string | undefined): string {
  const parsed = new URL(value?.trim() || DEFAULT_BASE_URL);
  if (parsed.protocol !== "https:" || parsed.hostname !== "openrouter.ai"
    || parsed.username || parsed.password) {
    throw new Error("OPENROUTER_BASE_URL must be the credential-free OpenRouter HTTPS endpoint");
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path !== "/api/v1") throw new Error("OPENROUTER_BASE_URL must end with /api/v1");
  return `${parsed.origin}${path}`;
}

function optionalReferer(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("OPENROUTER_HTTP_REFERER must be a credential-free HTTPS URL");
  }
  return parsed.toString();
}

export function resolveOpenRouterModel(model: string, family: OpenRouterModelFamily): string {
  const trimmed = model.trim();
  if (!trimmed) throw new Error("An OpenRouter model ID is required");
  if (trimmed.includes("/")) return trimmed;
  if (family === "openai") return `openai/${trimmed}`;
  const normalized = trimmed === "claude-sonnet-4-6" ? "claude-sonnet-4.6" : trimmed;
  return `anthropic/${normalized}`;
}

export function getOpenRouterConfig(): OpenRouterConfig {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const referer = optionalReferer(process.env.OPENROUTER_HTTP_REFERER);
  const title = process.env.OPENROUTER_APP_TITLE?.trim() || DEFAULT_APP_TITLE;
  return {
    apiKey,
    baseUrl: validatedBaseUrl(process.env.OPENROUTER_BASE_URL),
    defaultHeaders: {
      ...(referer ? { "HTTP-Referer": referer } : {}),
      "X-OpenRouter-Title": title,
    },
    providerPreferences: { require_parameters: true, data_collection: "deny" },
  };
}

export function openRouterChatCompletionsUrl(config = getOpenRouterConfig()): string {
  return `${config.baseUrl}/chat/completions`;
}

export function openRouterRequestHeaders(config = getOpenRouterConfig()): Record<string, string> {
  return {
    authorization: `Bearer ${config.apiKey}`,
    "content-type": "application/json",
    ...config.defaultHeaders,
  };
}
