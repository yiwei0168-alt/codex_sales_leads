import type { DiscoveryProviderId } from "@/lib/leads/workflow/hybrid-search-policy";

import type {
  DiscoveryItem,
  DiscoveryProvider,
  DiscoveryProviderEnvironment,
  DiscoveryProviderResult,
  DiscoveryQuery,
  DiscoveryUsage,
} from "./discovery-contracts";

interface ProviderOptions { fetchImplementation?: typeof fetch; timeoutMs?: number; maxAttempts?: number }

export const DISCOVERY_PROVIDER_ENVIRONMENTS: DiscoveryProviderEnvironment[] = [
  { id: "gemini-full", apiKeyEnv: "GEMINI_API_KEY", baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", purpose: "Planned Google-grounded discovery" },
  { id: "gemini-product", apiKeyEnv: "GEMINI_API_KEY", baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", purpose: "Fixed-query Google-grounded discovery" },
  { id: "google-places", apiKeyEnv: "GOOGLE_PLACES_API_KEY", baseUrlEnv: "GOOGLE_PLACES_BASE_URL",
    defaultBaseUrl: "https://places.googleapis.com/v1", purpose: "Local business discovery" },
  { id: "exa", apiKeyEnv: "EXA_API_KEY", baseUrlEnv: "EXA_BASE_URL",
    defaultBaseUrl: "https://api.exa.ai", purpose: "Professional semantic-page discovery" },
  { id: "brave", apiKeyEnv: "BRAVE_SEARCH_API_KEY", baseUrlEnv: "BRAVE_SEARCH_BASE_URL",
    defaultBaseUrl: "https://api.search.brave.com/res/v1", purpose: "Independent web index" },
  { id: "searchapi", apiKeyEnv: "SEARCHAPI_API_KEY", baseUrlEnv: "SEARCHAPI_BASE_URL",
    defaultBaseUrl: "https://www.searchapi.io/api/v1", purpose: "Google or Bing SERP with locale controls" },
];

function apiKeyFor(config: DiscoveryProviderEnvironment): string | undefined {
  const standard = process.env[config.apiKeyEnv]?.trim();
  if (standard) return standard;
  return config.id === "searchapi" ? process.env["SearchApi.io_API_KEY"]?.trim() : undefined;
}

function environment(id: DiscoveryProviderId): DiscoveryProviderEnvironment {
  const config = DISCOVERY_PROVIDER_ENVIRONMENTS.find((item) => item.id === id);
  if (!config) throw new Error(`Unknown discovery provider: ${id}`);
  return config;
}

function credentials(id: DiscoveryProviderId): { apiKey: string; baseUrl: string } {
  const config = environment(id);
  const apiKey = apiKeyFor(config);
  if (!apiKey) throw new Error(`${config.apiKeyEnv} is not configured`);
  return { apiKey, baseUrl: process.env[config.baseUrlEnv]?.trim() || config.defaultBaseUrl };
}

export function trustedDiscoveryEndpoint(baseUrl: string, allowedHosts: string[], path: string): string {
  const parsed = new URL(baseUrl.trim());
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Untrusted discovery-provider endpoint: ${parsed.hostname || "invalid"}`);
  }
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function requestJson<T>(provider: string, url: string, init: RequestInit, options: Required<Pick<ProviderOptions,
  "fetchImplementation" | "timeoutMs" | "maxAttempts">>, signal?: AbortSignal): Promise<{ body: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)])
        : AbortSignal.timeout(options.timeoutMs);
      const response = await options.fetchImplementation(url, { ...init, signal: requestSignal });
      const text = await response.text();
      if (!response.ok) {
        const transient = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!transient || attempt === options.maxAttempts) throw new Error(`${provider} HTTP ${response.status}: ${text.slice(0, 500)}`);
        lastError = new Error(`${provider} HTTP ${response.status}`);
      } else {
        try { return { body: JSON.parse(text) as T, attempts: attempt }; }
        catch { throw new Error(`${provider} returned non-JSON content`); }
      }
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts || signal?.aborted) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} request failed`);
}

function boundedResults(value: number): number { return Math.max(1, Math.min(20, Math.round(value))); }
function language(value: string): string { return value.toLowerCase().split(/[-_]/)[0] || "en"; }

function publicUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      for (const match of item.matchAll(/https?:\/\/[^\s<>()\]"']+/g)) {
        try {
          const url = new URL(match[0].replace(/[.,;:!?，。；：！？）】]+$/, ""));
          if (url.protocol === "https:" || url.protocol === "http:") urls.add(url.toString());
        } catch { /* Ignore malformed provider URLs. */ }
      }
      return;
    }
    if (Array.isArray(item)) return item.forEach(visit);
    if (item && typeof item === "object") Object.values(item as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return [...urls].filter((value) => {
    const parsed = new URL(value);
    if (/^(?:www\.)?w3\.org$/i.test(parsed.hostname) && /\/(?:2000\/svg|1999\/xhtml)/i.test(parsed.pathname)) return false;
    return !(/^(?:www\.)?google\.[a-z.]+$/i.test(parsed.hostname) && parsed.pathname === "/search");
  });
}

function usage(value: Record<string, unknown> | undefined, paidSearchCredits = 1): DiscoveryUsage {
  const number = (keys: string[]): number => {
    for (const key of keys) if (typeof value?.[key] === "number") return Math.max(0, value[key] as number);
    return 0;
  };
  const inputTokens = number(["input_tokens", "prompt_tokens", "inputTokenCount"]);
  const outputTokens = number(["output_tokens", "completion_tokens", "outputTokenCount"]);
  return { paidSearchCredits, inputTokens, outputTokens,
    totalTokens: number(["total_tokens", "totalTokenCount"]) || inputTokens + outputTokens };
}

function item(providerId: DiscoveryProviderId, value: Omit<DiscoveryItem, "providerId" | "rank">,
  index: number): DiscoveryItem { return { providerId, rank: index + 1, ...value }; }

function result(providerId: DiscoveryProviderId, query: DiscoveryQuery, startedAt: number, items: DiscoveryItem[],
  attempts: number, extra: Partial<DiscoveryProviderResult> = {}): DiscoveryProviderResult {
  return { providerId, query, items, sourceUrls: [...new Set(items.flatMap((entry) => entry.url ? [entry.url] : []))],
    requestCount: attempts, retryCount: Math.max(0, attempts - 1), latencyMs: Date.now() - startedAt,
    usage: usage(undefined), ...extra };
}

abstract class BaseProvider {
  protected readonly fetchImplementation: typeof fetch;
  protected readonly timeoutMs: number;
  protected readonly maxAttempts: number;
  constructor(options: ProviderOptions = {}, defaultTimeout = 45_000) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? defaultTimeout;
    this.maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 2));
  }
  protected requestOptions() { return { fetchImplementation: this.fetchImplementation,
    timeoutMs: this.timeoutMs, maxAttempts: this.maxAttempts }; }
}

class GeminiDiscoveryProvider extends BaseProvider implements DiscoveryProvider {
  readonly id: "gemini-full" | "gemini-product";
  constructor(id: "gemini-full" | "gemini-product", options: ProviderOptions = {}) { super(options, 120_000); this.id = id; }
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const url = trustedDiscoveryEndpoint(baseUrl.replace(/\/openai(?:\/v1)?\/?$/i, ""),
      ["generativelanguage.googleapis.com"], "interactions");
    const input = this.id === "gemini-full" ? [
      "Plan and execute this bounded company-discovery task using Google Search.", query.query,
      `Market: ${query.countryName} (${query.countryCode}). Return at most ${boundedResults(query.maxResults)} real companies.`,
      "Return concise company names, official URLs and matching signals. Do not include people, contacts, factories supplying Cudy, scores or cooperation paths.",
    ].join("\n") : [
      `Find up to ${boundedResults(query.maxResults)} real companies for this fixed query: ${query.query}`,
      `Market: ${query.countryName} (${query.countryCode}). Use local terminology where useful.`,
      "Use Google Search. Return company names, official URLs and short matching signals only.",
    ].join("\n");
    const response = await requestJson<{ steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      usage?: Record<string, unknown> }>(this.id, url, { method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.GEMINI_DISCOVERY_MODEL?.trim()
        || process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.6-flash", input,
      tools: [{ type: "google_search" }], generation_config: { thinking_level: "low" } }) }, this.requestOptions(), signal);
    const answerText = (response.body.steps ?? []).filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? []).filter((content) => content.type === "text")
      .map((content) => content.text ?? "").join("").trim();
    const urls = publicUrls(response.body);
    const items = urls.slice(0, boundedResults(query.maxResults)).map((urlValue, index) => item(this.id, {
      title: new URL(urlValue).hostname.replace(/^www\./, ""), url: urlValue,
      snippet: answerText.slice(0, 2_000), sourceKind: "grounded-answer",
    }, index));
    return result(this.id, query, startedAt, items, response.attempts, { answerText, sourceUrls: urls,
      usage: usage(response.body.usage), rawResponse: response.body });
  }
}

class GooglePlacesDiscoveryProvider extends BaseProvider implements DiscoveryProvider {
  readonly id = "google-places" as const;
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const canonicalBaseUrl = `${new URL(baseUrl).origin}/v1`;
    const response = await requestJson<{ places?: Array<{ id?: string; displayName?: { text?: string };
      formattedAddress?: string; websiteUri?: string; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string } }> }>(
      this.id, trustedDiscoveryEndpoint(canonicalBaseUrl, ["places.googleapis.com"], "places:searchText"), {
        method: "POST", headers: { "x-goog-api-key": apiKey,
          "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.businessStatus,places.primaryTypeDisplayName",
          "content-type": "application/json" },
        body: JSON.stringify({ textQuery: `${query.query} ${query.countryName}`,
          pageSize: boundedResults(query.maxResults), languageCode: language(query.languageCode), regionCode: query.countryCode }),
      }, this.requestOptions(), signal);
    const items = (response.body.places ?? []).map((place, index) => item(this.id, {
      title: place.displayName?.text ?? place.id ?? "Unnamed place", url: place.websiteUri ?? place.googleMapsUri ?? null,
      snippet: [place.primaryTypeDisplayName?.text, place.formattedAddress].filter(Boolean).join(" · "),
      sourceKind: "place", externalId: place.id,
    }, index));
    return result(this.id, query, startedAt, items, response.attempts, { rawResponse: response.body });
  }
}

class ExaDiscoveryProvider extends BaseProvider implements DiscoveryProvider {
  readonly id = "exa" as const;
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const response = await requestJson<{ results?: Array<{ id?: string; title?: string; url?: string; text?: string }> }>(
      this.id, trustedDiscoveryEndpoint(baseUrl, ["api.exa.ai"], "search"), { method: "POST",
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ query: `${query.query} in ${query.countryName}`, type: "auto", category: "company",
          userLocation: query.countryCode, numResults: boundedResults(query.maxResults),
          excludeDomains: query.excludeDomains?.slice(0, 100), contents: { text: true } }) }, this.requestOptions(), signal);
    const items = (response.body.results ?? []).flatMap((entry, index) => entry.url ? [item(this.id, {
      title: entry.title ?? new URL(entry.url).hostname, url: entry.url,
      snippet: entry.text?.slice(0, 2_000) ?? "", sourceKind: "web", externalId: entry.id,
    }, index)] : []);
    return result(this.id, query, startedAt, items, response.attempts, { rawResponse: response.body });
  }
}

class BraveDiscoveryProvider extends BaseProvider implements DiscoveryProvider {
  readonly id = "brave" as const;
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    const { apiKey, baseUrl } = credentials(this.id);
    const url = new URL(trustedDiscoveryEndpoint(baseUrl, ["api.search.brave.com"], "web/search"));
    url.search = new URLSearchParams({ q: query.query, country: query.countryCode,
      search_lang: language(query.languageCode), count: String(boundedResults(query.maxResults)) }).toString();
    const response = await requestJson<{ web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }>(
      this.id, url.toString(), { headers: { "x-subscription-token": apiKey, accept: "application/json" } },
      this.requestOptions(), signal);
    const items = (response.body.web?.results ?? []).flatMap((entry, index) => entry.url ? [item(this.id, {
      title: entry.title ?? new URL(entry.url).hostname, url: entry.url,
      snippet: entry.description ?? "", sourceKind: "web",
    }, index)] : []);
    return result(this.id, query, startedAt, items, response.attempts, { rawResponse: response.body });
  }
}

class SearchApiDiscoveryProvider extends BaseProvider implements DiscoveryProvider {
  readonly id = "searchapi" as const;
  async search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult> {
    const startedAt = Date.now();
    if (query.engine !== "google" && query.engine !== "bing") throw new Error(`SearchAPI engine ${query.engine} is unsupported`);
    const { apiKey, baseUrl } = credentials(this.id);
    const url = new URL(trustedDiscoveryEndpoint(baseUrl, ["www.searchapi.io"], "search"));
    url.search = new URLSearchParams({ engine: query.engine, q: query.query, location: query.countryName,
      gl: query.countryCode.toLowerCase(), hl: language(query.languageCode), num: String(boundedResults(query.maxResults)) }).toString();
    const response = await requestJson<{ organic_results?: Array<{ title?: string; link?: string; snippet?: string; position?: number }> }>(
      this.id, url.toString(), { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } },
      this.requestOptions(), signal);
    const items = (response.body.organic_results ?? []).slice(0, boundedResults(query.maxResults))
      .flatMap((entry, index) => entry.link ? [item(this.id, { title: entry.title ?? new URL(entry.link).hostname,
        url: entry.link, snippet: entry.snippet ?? "", sourceKind: "web" }, entry.position ? entry.position - 1 : index)] : []);
    return result(this.id, query, startedAt, items, response.attempts, { rawResponse: response.body });
  }
}

export function createDiscoveryProvider(id: DiscoveryProviderId, options: ProviderOptions = {}): DiscoveryProvider {
  if (id === "gemini-full" || id === "gemini-product") return new GeminiDiscoveryProvider(id, options);
  if (id === "google-places") return new GooglePlacesDiscoveryProvider(options);
  if (id === "exa") return new ExaDiscoveryProvider(options);
  if (id === "brave") return new BraveDiscoveryProvider(options);
  return new SearchApiDiscoveryProvider(options);
}

export function discoveryEnvironmentStatus() {
  return DISCOVERY_PROVIDER_ENVIRONMENTS.map((config) => ({ providerId: config.id,
    configured: Boolean(apiKeyFor(config)), apiKeyEnv: config.apiKeyEnv,
    baseUrl: process.env[config.baseUrlEnv]?.trim() || config.defaultBaseUrl, purpose: config.purpose }));
}
