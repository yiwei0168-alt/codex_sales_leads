import { ProviderUnavailableError } from "./contracts";

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
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

  async search(input: TavilySearchInput, signal?: AbortSignal): Promise<TavilySearchResponse> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new ProviderUnavailableError(this.id, new Error("TAVILY_API_KEY is not configured"));
    const depth = input.searchDepth ?? "basic";
    let response: Response;
    try {
      response = await fetchWithRetry("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          query: input.query,
          country: input.country ?? "mexico",
          search_depth: depth,
          max_results: Math.max(1, Math.min(input.maxResults ?? 10, 20)),
          include_answer: false,
          include_raw_content: input.includeRawContent ? "markdown" : false,
          include_domains: input.includeDomains,
        }),
        signal,
      });
    } catch (error) {
      throw new ProviderUnavailableError(this.id, error);
    }
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
    };
  }

  async extract(urls: string[], signal?: AbortSignal): Promise<TavilyExtractResponse> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new ProviderUnavailableError(this.id, new Error("TAVILY_API_KEY is not configured"));
    if (urls.length === 0) return { results: [], failedUrls: [], creditsUsed: 0 };
    let response: Response;
    try {
      response = await fetchWithRetry("https://api.tavily.com/extract", {
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
      });
    } catch (error) {
      throw new ProviderUnavailableError(this.id, error);
    }
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
    };
  }
}
