export const DISCOVERY_PROVIDER_IDS = [
  "gemini",
  "tavily",
  "google-places",
  "exa",
  "brave",
  "searchapi",
] as const;

export type DiscoveryProviderId = typeof DISCOVERY_PROVIDER_IDS[number];

export interface DiscoveryQuery {
  query: string;
  countryCode: string;
  countryName: string;
  languageCode: string;
  maxResults: number;
}

export interface DiscoveryItem {
  providerId: DiscoveryProviderId;
  title: string;
  url: string | null;
  snippet: string;
  rank: number;
  sourceKind: "web" | "place" | "grounded-answer";
  externalId?: string;
}

export interface DiscoveryProviderResult {
  providerId: DiscoveryProviderId;
  query: DiscoveryQuery;
  items: DiscoveryItem[];
  answerText?: string;
  sourceUrls: string[];
  requestCount: number;
  latencyMs: number;
  usage?: Record<string, number>;
}

export interface DiscoveryProvider {
  readonly id: DiscoveryProviderId;
  search(query: DiscoveryQuery, signal?: AbortSignal): Promise<DiscoveryProviderResult>;
}

export interface DiscoveryProviderEnvironment {
  id: DiscoveryProviderId;
  apiKeyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  purpose: string;
}
