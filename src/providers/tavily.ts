import { ProviderUnavailableError } from "./contracts";

export interface TavilySearchProviderOptions {
  maxAttempts?: number;
  fetchImplementation?: typeof fetch;
  baseUrl?: string;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts: number,
  fetchImplementation: typeof fetch,
): Promise<{ response: Response; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
    try {
      const response = await fetchImplementation(url, init);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) {
        return { response, attempts: attempt + 1 };
      }
      lastError = new Error(`Retryable HTTP ${response.status}`);
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1_000, 10_000)
        : 500 * (2 ** attempt) + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      continue;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

export interface TavilySearchInput {
  query: string;
  maxResults?: number;
  country?: string;
  searchDepth?: "basic" | "advanced";
  includeRawContent?: boolean;
  includeDomains?: string[];
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  rawContent?: string | null;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  responseTime?: number;
  creditsUsed: number;
  requestId?: string;
  attempts?: number;
  retries?: number;
  latencyMs?: number;
}

export interface TavilyExtractResult {
  url: string;
  rawContent: string;
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  failedUrls: string[];
  creditsUsed: number;
  requestId?: string;
  attempts?: number;
  retries?: number;
  latencyMs?: number;
}

interface TavilyWireResponse {
  query?: string;
  results?: Array<{ title?: string; url?: string; content?: string; score?: number; raw_content?: string | null }>;
  response_time?: number;
  request_id?: string;
  usage?: { credits?: number };
}

export class TavilySearchProvider {
  readonly id = "tavily";
  private readonly maxAttempts: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: TavilySearchProviderOptions = {}) {
    const maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
      throw new Error("Tavily maxAttempts must be an integer between 1 and 3");
    }
    this.maxAttempts = maxAttempts;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    const parsed = new URL(options.baseUrl?.trim() || process.env.TAVILY_BASE_URL?.trim() || "https://api.tavily.com");
    if (parsed.protocol !== "https:" || parsed.hostname !== "api.tavily.com" || parsed.username || parsed.password) {
      throw new Error("TAVILY_BASE_URL must be the trusted Tavily HTTPS endpoint");
    }
    this.baseUrl = parsed.toString().replace(/\/$/, "");
  }

  async search(input: TavilySearchInput, signal?: AbortSignal): Promise<TavilySearchResponse> {
    const startedAt = Date.now();
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new ProviderUnavailableError(this.id, new Error("TAVILY_API_KEY is not configured"));
    const depth = input.searchDepth ?? "basic";
    let result: { response: Response; attempts: number };
    try {
      result = await fetchWithRetry(`${this.baseUrl}/search`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          query: input.query,
          country: input.country,
          search_depth: depth,
          max_results: Math.max(1, Math.min(input.maxResults ?? 10, 20)),
          include_answer: false,
          include_raw_content: input.includeRawContent ? "markdown" : false,
          include_domains: input.includeDomains,
        }),
        signal,
      }, this.maxAttempts, this.fetchImplementation);
    } catch (error) {
      throw new ProviderUnavailableError(this.id, error);
    }
    const { response, attempts } = result;
    const body = await response.json() as TavilyWireResponse & { detail?: unknown };
    if (!response.ok) throw new ProviderUnavailableError(this.id, new Error(`HTTP ${response.status}: ${JSON.stringify(body.detail ?? body)}`));
    return {
      query: body.query ?? input.query,
      results: (body.results ?? []).flatMap((item) => item.url && item.title ? [{
        title: item.title,
        url: item.url,
        content: item.content ?? "",
        score: typeof item.score === "number" ? item.score : 0,
        rawContent: item.raw_content,
      }] : []),
      responseTime: body.response_time,
      creditsUsed: body.usage?.credits ?? (depth === "advanced" ? 2 : 1),
      requestId: body.request_id,
      attempts,
      retries: Math.max(0, attempts - 1),
      latencyMs: Date.now() - startedAt,
    };
  }

  async extract(urls: string[], signal?: AbortSignal): Promise<TavilyExtractResponse> {
    const startedAt = Date.now();
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new ProviderUnavailableError(this.id, new Error("TAVILY_API_KEY is not configured"));
    if (urls.length === 0) return { results: [], failedUrls: [], creditsUsed: 0,
      attempts: 0, retries: 0, latencyMs: 0 };
    let result: { response: Response; attempts: number };
    try {
      result = await fetchWithRetry(`${this.baseUrl}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          urls: urls.slice(0, 20),
          extract_depth: "basic",
          format: "text",
          include_images: false,
          include_usage: true,
          timeout: 20,
        }),
        signal,
      }, this.maxAttempts, this.fetchImplementation);
    } catch (error) {
      throw new ProviderUnavailableError(this.id, error);
    }
    const { response, attempts } = result;
    const body = await response.json() as {
      results?: Array<{ url?: string; raw_content?: string }>;
      failed_results?: Array<{ url?: string } | string>;
      usage?: { credits?: number };
      request_id?: string;
      detail?: unknown;
    };
    if (!response.ok) throw new ProviderUnavailableError(this.id, new Error(`HTTP ${response.status}: ${JSON.stringify(body.detail ?? body)}`));
    return {
      results: (body.results ?? []).flatMap((item) => item.url ? [{ url: item.url, rawContent: item.raw_content ?? "" }] : []),
      failedUrls: (body.failed_results ?? []).flatMap((item) => typeof item === "string" ? [item] : item.url ? [item.url] : []),
      creditsUsed: body.usage?.credits ?? Math.ceil((body.results?.length ?? 0) / 5),
      requestId: body.request_id,
      attempts,
      retries: Math.max(0, attempts - 1),
      latencyMs: Date.now() - startedAt,
    };
  }
}
