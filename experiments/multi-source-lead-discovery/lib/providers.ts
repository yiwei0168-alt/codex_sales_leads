import { TavilySearchProvider } from "@/providers/tavily";

import type {
  DiscoveryItem,
  DiscoveryProvider,
  DiscoveryProviderEnvironment,
  DiscoveryProviderId,
  DiscoveryProviderResult,
  DiscoveryQuery,
} from "./contracts";
import { boundedResults, publicUrls, requestJson, trustedEndpoint } from "./http";

type ProviderOptions = { fetchImplementation?: typeof fetch; timeoutMs?: number };

export const DISCOVERY_PROVIDER_ENVIRONMENTS: DiscoveryProviderEnvironment[] = [
  { id: "gemini", apiKeyEnv: "GEMINI_API_KEY", baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", purpose: "Google-grounded broad web discovery" },
  { id: "tavily", apiKeyEnv: "TAVILY_API_KEY", baseUrlEnv: "TAVILY_BASE_URL",
    defaultBaseUrl: "https://api.tavily.com", purpose: "Agent-oriented web search and later evidence extraction" },
  { id: "google-places", apiKeyEnv: "GOOGLE_PLACES_API_KEY", baseUrlEnv: "GOOGLE_PLACES_BASE_URL",
    defaultBaseUrl: "https://places.googleapis.com/v1", purpose: "Small and local downstream-channel discovery" },
  { id: "exa", apiKeyEnv: "EXA_API_KEY", baseUrlEnv: "EXA_BASE_URL",
    defaultBaseUrl: "https://api.exa.ai", purpose: "Semantic company and professional-scenario discovery" },
  { id: "brave", apiKeyEnv: "BRAVE_SEARCH_API_KEY", baseUrlEnv: "BRAVE_SEARCH_BASE_URL",
    defaultBaseUrl: "https://api.search.brave.com/res/v1", purpose: "Independent-index long-tail web discovery" },
  { id: "searchapi", apiKeyEnv: "SEARCHAPI_API_KEY", baseUrlEnv: "SEARCHAPI_BASE_URL",
    defaultBaseUrl: "https://www.searchapi.io/api/v1", purpose: "Google SERP and local-result discovery with explicit locale controls" },
];

function apiKeyFor(config: DiscoveryProviderEnvironment): string | undefined {
  const standardKey = process.env[config.apiKeyEnv]?.trim();
  if (standardKey) return standardKey;
  if (config.id === "searchapi") return process.env["SearchApi.io_API_KEY"]?.trim();
  return undefined;
}

function environment(id: DiscoveryProviderId): DiscoveryProviderEnvironment {
  const found = DISCOVERY_PROVIDER_ENVIRONMENTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown discovery provider: ${id}`);
  return found;
}

function credentials(id: DiscoveryProviderId): { apiKey: string; baseUrl: string } {
  const config = environment(id);
  const apiKey = apiKeyFor(config);
  if (!apiKey) throw new Error(`${config.apiKeyEnv} is not configured`);
  return { apiKey, baseUrl: process.env[config.baseUrlEnv]?.trim() || config.defaultBaseUrl };
}

function item(
  providerId: DiscoveryProviderId,
  value: Omit<DiscoveryItem, "providerId" | "rank">,
  index: number,
): DiscoveryItem {
  return { providerId, rank: index + 1, ...value };
}

function result(
  providerId: DiscoveryProviderId,
  query: DiscoveryQuery,
  startedAt: number,
  items: DiscoveryItem[],
  extra: Partial<DiscoveryProviderResult> = {},
): DiscoveryProviderResult {
  return {
    providerId,
    query,
    items,
    sourceUrls: [...new Set(items.flatMap((entry) => entry.url ? [entry.url] : []))],
    requestCount: 1,
    latencyMs: Date.now() - startedAt,
    ...extra,
  };
}

class GeminiDiscoveryProvider implements DiscoveryProvider {
  readonly id = "gemini" as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 90_000;
  }

  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const url = trustedEndpoint(baseUrl.replace(/\/openai(?:\/v1)?\/?$/i, ""),
      ["generativelanguage.googleapis.com"], "interactions");
    const body = await requestJson<{ steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }>(
      this.id, url, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.GEMINI_DISCOVERY_MODEL?.trim() || process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.6-flash",
          input: [
            `Find up to ${boundedResults(query.maxResults)} real companies relevant to this professional-channel search: ${query.query}.`,
            `Market: ${query.countryName} (${query.countryCode}); use ${query.languageCode} and local terminology where useful.`,
            "Use Google Search. Return concise company names, official URLs and why each matches. Do not include people or contact details.",
          ].join("\n"),
          tools: [{ type: "google_search" }],
          generation_config: { thinking_level: "low" },
        }),
      }, this.fetchImplementation, this.timeoutMs, signal,
    );
    const answerText = (body.steps ?? []).filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? []).filter((content) => content.type === "text")
      .map((content) => content.text ?? "").join("").trim();
    const urls = publicUrls(body);
    const items = urls.slice(0, boundedResults(query.maxResults)).map((urlValue, index) => item(this.id, {
      title: new URL(urlValue).hostname.replace(/^www\./, ""), url: urlValue,
      snippet: answerText.slice(0, 2_000), sourceKind: "grounded-answer",
    }, index));
    return result(this.id, query, startedAt, items, { answerText, sourceUrls: urls });
  }
}

class TavilyDiscoveryProvider implements DiscoveryProvider {
  readonly id = "tavily" as const;
  private readonly provider: TavilySearchProvider;
  constructor(options: ProviderOptions = {}) {
    this.provider = new TavilySearchProvider({ maxAttempts: 1, fetchImplementation: options.fetchImplementation });
  }
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const response = await this.provider.search({ query: query.query, country: query.countryName.toLowerCase(),
      searchDepth: "advanced", maxResults: boundedResults(query.maxResults), includeRawContent: false }, signal);
    const items = response.results.map((entry, index) => item(this.id, {
      title: entry.title, url: entry.url, snippet: entry.content, sourceKind: "web",
    }, index));
    return result(this.id, query, startedAt, items, { usage: { credits: response.creditsUsed } });
  }
}

class GooglePlacesDiscoveryProvider implements DiscoveryProvider {
  readonly id = "google-places" as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: ProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const canonicalBaseUrl = `${new URL(baseUrl).origin}/v1`;
    const body = await requestJson<{ places?: Array<{ id?: string; displayName?: { text?: string };
      formattedAddress?: string; websiteUri?: string; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string } }> }>(
      this.id, trustedEndpoint(canonicalBaseUrl, ["places.googleapis.com"], "places:searchText"), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.businessStatus,places.primaryTypeDisplayName",
          "content-type": "application/json",
        },
        body: JSON.stringify({ textQuery: `${query.query} ${query.countryName}`,
          pageSize: boundedResults(query.maxResults), languageCode: query.languageCode, regionCode: query.countryCode }),
      }, this.fetchImplementation, this.timeoutMs, signal,
    );
    const items = (body.places ?? []).map((place, index) => item(this.id, {
      title: place.displayName?.text ?? place.id ?? "Unnamed place",
      url: place.websiteUri ?? place.googleMapsUri ?? null,
      snippet: [place.primaryTypeDisplayName?.text, place.formattedAddress].filter(Boolean).join(" · "),
      sourceKind: "place", externalId: place.id,
    }, index));
    return result(this.id, query, startedAt, items);
  }
}

class ExaDiscoveryProvider implements DiscoveryProvider {
  readonly id = "exa" as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: ProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const body = await requestJson<{ results?: Array<{ id?: string; title?: string; url?: string; text?: string }> }>(
      this.id, trustedEndpoint(baseUrl, ["api.exa.ai"], "search"), {
        method: "POST", headers: { "x-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ query: `${query.query} in ${query.countryName}`, type: "auto", category: "company",
          userLocation: query.countryCode, numResults: boundedResults(query.maxResults),
          contents: { text: true } }),
      }, this.fetchImplementation, this.timeoutMs, signal,
    );
    const items = (body.results ?? []).flatMap((entry, index) => entry.url ? [item(this.id, {
      title: entry.title ?? new URL(entry.url).hostname, url: entry.url,
      snippet: entry.text?.slice(0, 2_000) ?? "", sourceKind: "web", externalId: entry.id,
    }, index)] : []);
    return result(this.id, query, startedAt, items);
  }
}

class BraveDiscoveryProvider implements DiscoveryProvider {
  readonly id = "brave" as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: ProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const url = new URL(trustedEndpoint(baseUrl, ["api.search.brave.com"], "web/search"));
    url.search = new URLSearchParams({ q: query.query, country: query.countryCode,
      search_lang: query.languageCode, count: String(boundedResults(query.maxResults)) }).toString();
    const body = await requestJson<{ web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }>(
      this.id, url.toString(), { headers: { "x-subscription-token": apiKey, accept: "application/json" } },
      this.fetchImplementation, this.timeoutMs, signal,
    );
    const items = (body.web?.results ?? []).flatMap((entry, index) => entry.url ? [item(this.id, {
      title: entry.title ?? new URL(entry.url).hostname, url: entry.url,
      snippet: entry.description ?? "", sourceKind: "web",
    }, index)] : []);
    return result(this.id, query, startedAt, items);
  }
}

class SearchApiDiscoveryProvider implements DiscoveryProvider {
  readonly id = "searchapi" as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: ProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const url = new URL(trustedEndpoint(baseUrl, ["www.searchapi.io"], "search"));
    url.search = new URLSearchParams({ engine: "google", q: query.query, location: query.countryName,
      gl: query.countryCode.toLowerCase(), hl: query.languageCode }).toString();
    const body = await requestJson<{ organic_results?: Array<{ title?: string; link?: string; snippet?: string; position?: number }> }>(
      this.id, url.toString(), { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } },
      this.fetchImplementation, this.timeoutMs, signal,
    );
    const items = (body.organic_results ?? []).slice(0, boundedResults(query.maxResults)).flatMap((entry, index) => entry.link ? [item(this.id, {
      title: entry.title ?? new URL(entry.link).hostname, url: entry.link,
      snippet: entry.snippet ?? "", sourceKind: "web",
    }, entry.position ? entry.position - 1 : index)] : []);
    return result(this.id, query, startedAt, items);
  }
}

export function createDiscoveryProvider(id: DiscoveryProviderId, options: ProviderOptions = {}): DiscoveryProvider {
  if (id === "gemini") return new GeminiDiscoveryProvider(options);
  if (id === "tavily") return new TavilyDiscoveryProvider(options);
  if (id === "google-places") return new GooglePlacesDiscoveryProvider(options);
  if (id === "exa") return new ExaDiscoveryProvider(options);
  if (id === "brave") return new BraveDiscoveryProvider(options);
  return new SearchApiDiscoveryProvider(options);
}

export function discoveryEnvironmentStatus() {
  return DISCOVERY_PROVIDER_ENVIRONMENTS.map((config) => ({
    providerId: config.id,
    configured: Boolean(apiKeyFor(config)),
    apiKeyEnv: config.apiKeyEnv,
    baseUrl: process.env[config.baseUrlEnv]?.trim() || config.defaultBaseUrl,
    purpose: config.purpose,
  }));
}
