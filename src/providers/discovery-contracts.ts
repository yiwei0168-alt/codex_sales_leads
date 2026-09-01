import type { DiscoveryProviderId, LeadSearchCategory } from "@/lib/leads/workflow/hybrid-search-policy";

export type DiscoverySearchEngine = "google-grounded" | "google" | "bing" | "google-places" | "brave" | "exa";

export interface DiscoveryQuery {
  query: string;
  countryCode: string;
  countryName: string;
  languageCode: string;
  maxResults: number;
  category: LeadSearchCategory;
  track: string;
  engine: DiscoverySearchEngine;
  mechanism: string;
  excludeDomains?: string[];
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

export interface DiscoveryUsage {
  paidSearchCredits: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface DiscoveryProviderResult {
  providerId: DiscoveryProviderId;
  query: DiscoveryQuery;
  items: DiscoveryItem[];
  answerText?: string;
  sourceUrls: string[];
  requestCount: number;
  retryCount: number;
  latencyMs: number;
  usage: DiscoveryUsage;
  rawResponse?: unknown;
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
