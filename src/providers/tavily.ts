import { ProviderUnavailableError } from "./contracts";

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
      response = await fetch("https://api.tavily.com/search", {
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
}
