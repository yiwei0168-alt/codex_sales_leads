import { createHash } from "node:crypto";

import type { ChannelRole } from "@/lib/domain";
import type { DiscoveryItem, DiscoveryQuery } from "@/providers/discovery-contracts";
import { leadEvidenceContentHash } from "@/lib/leads/evidence-snapshot";

import type { HybridSearchRouteStep } from "./hybrid-search-policy";
import type { LeadDiscoveryOccurrence, LeadEvidenceItem, LeadWorkflowCandidate } from "./types";

const blockedIdentityHosts = new Set([
  "google.com", "maps.google.com", "bing.com", "linkedin.com", "facebook.com", "instagram.com", "youtube.com",
  "wikipedia.org", "amazon.com", "alibaba.com",
]);
const commonSecondLevelSuffixes = new Set(["co.uk", "org.uk", "com.au", "com.br", "com.mx", "co.jp", "co.kr"]);

function hash(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 16); }

export function normalizedCompanyDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname || blockedIdentityHosts.has(hostname)
      || [...blockedIdentityHosts].some((blocked) => hostname.endsWith(`.${blocked}`))) return null;
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length <= 2) return hostname;
    const lastTwo = labels.slice(-2).join(".");
    return commonSecondLevelSuffixes.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
  } catch { return null; }
}

function normalizedName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:gmbh|ag|kg|ltd|limited|inc|corp|corporation|llc|sarl|sas|bv)\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

interface RegistryEntry {
  key: string;
  domain: string | null;
  officialUrl: string | null;
  companyName: string;
  placeIds: Set<string>;
  roles: Set<ChannelRole>;
  categories: Set<string>;
  occurrences: LeadDiscoveryOccurrence[];
  evidence: LeadEvidenceItem[];
  firstRank: number;
}

export interface RegistryAddResult {
  accepted: boolean;
  firstDiscovery: boolean;
  candidateKey: string | null;
  domain: string | null;
  rejectionReason?: string;
}

export class RealtimeCandidateRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly domainIndex = new Map<string, string>();
  private readonly placeIndex = new Map<string, string>();
  private readonly nameIndex = new Map<string, string>();

  constructor(private readonly evidenceRunId: string, private readonly countryCode: string) {}

  get size(): number { return this.entries.size; }
  get domainCount(): number { return [...this.entries.values()].filter((entry) => entry.domain).length; }
  get unresolvedPlaceCount(): number { return [...this.entries.values()].filter((entry) => !entry.domain && entry.placeIds.size > 0).length; }
  domains(): string[] { return [...this.domainIndex.keys()]; }

  add(item: DiscoveryItem, query: DiscoveryQuery, route: HybridSearchRouteStep, roles: ChannelRole[]): RegistryAddResult {
    if (!item.title.trim()) return { accepted: false, firstDiscovery: false, candidateKey: null, domain: null,
      rejectionReason: "missing-company-name" };
    const domain = normalizedCompanyDomain(item.url);
    const nameKey = normalizedName(item.title);
    const existingKey = domain && this.domainIndex.get(domain) || item.externalId && this.placeIndex.get(item.externalId)
      || nameKey && this.nameIndex.get(`${this.countryCode}:${nameKey}`);
    const key = existingKey || (domain ? `domain:${domain}` : item.externalId ? `place:${item.externalId}`
      : nameKey ? `name:${this.countryCode}:${nameKey}` : "");
    if (!key) return { accepted: false, firstDiscovery: false, candidateKey: null, domain,
      rejectionReason: "missing-identity-key" };
    const firstDiscovery = !this.entries.has(key);
    const entry = this.entries.get(key) ?? { key, domain, officialUrl: domain && item.url ? item.url : null,
      companyName: item.title.trim(), placeIds: new Set<string>(), roles: new Set<ChannelRole>(),
      categories: new Set<string>(), occurrences: [], evidence: [], firstRank: item.rank };
    if (domain && !entry.domain) { entry.domain = domain; entry.officialUrl = item.url; this.domainIndex.set(domain, key); }
    if (item.externalId) { entry.placeIds.add(item.externalId); this.placeIndex.set(item.externalId, key); }
    if (domain) this.domainIndex.set(domain, key);
    if (nameKey) this.nameIndex.set(`${this.countryCode}:${nameKey}`, key);
    roles.forEach((role) => entry.roles.add(role));
    entry.categories.add(route.category);
    entry.firstRank = Math.min(entry.firstRank, item.rank);
    const capturedAt = new Date().toISOString();
    entry.occurrences.push({ occurrenceId: `occurrence-${hash(`${route.provider}|${query.query}|${item.url}|${item.externalId}|${item.rank}`)}`,
      provider: route.provider, engine: route.engine, mechanism: route.mechanism, category: route.category,
      track: route.track, query: query.query, rank: item.rank, url: item.url, domain,
      externalId: item.externalId, firstDiscovery, capturedAt });
    if (item.url && item.snippet.trim()) {
      const excerpt = item.snippet.replace(/\s+/g, " ").trim().slice(0, 2_000);
      const evidenceId = `evidence-${hash(`${route.provider}|${item.url}`)}`;
      if (!entry.evidence.some((evidence) => evidence.id === evidenceId)) entry.evidence.push({
        id: evidenceId, url: item.url, title: item.title, excerpt, sourceType: "discovery",
        provider: route.provider, capturedAt, evidenceRunId: this.evidenceRunId,
        contentHash: leadEvidenceContentHash(excerpt), freshnessStatus: "fresh",
      });
    }
    this.entries.set(key, entry);
    return { accepted: true, firstDiscovery, candidateKey: key, domain };
  }

  toWorkflowCandidates(limit: number): LeadWorkflowCandidate[] {
    return [...this.entries.values()].filter((entry) => entry.domain).sort((left, right) => {
      const providerDifference = new Set(right.occurrences.map((item) => item.provider)).size
        - new Set(left.occurrences.map((item) => item.provider)).size;
      return providerDifference || left.firstRank - right.firstRank || left.companyName.localeCompare(right.companyName);
    }).slice(0, limit).map((entry) => ({
      candidateId: `lead-${hash(entry.domain ?? entry.key)}`,
      evidenceSnapshotRunId: this.evidenceRunId,
      companyName: entry.companyName,
      domain: entry.domain!,
      officialWebsiteUrl: entry.officialUrl ?? `https://${entry.domain}/`,
      queryRoles: [...entry.roles],
      queryFamily: entry.roles.has("Distributor") || entry.roles.has("VAD") ? "distribution"
        : entry.roles.has("VAR") || entry.roles.has("Dealer") || entry.roles.has("Reseller") ? "resale"
          : entry.roles.has("Retailer") || entry.roles.has("E-tailer") ? "retail"
            : entry.roles.has("ISP") ? "isp" : entry.roles.has("Agent") ? "agent"
              : entry.roles.has("Brand Owner") ? "brand" : "services",
      providerScore: Math.min(1, 0.5 + Math.min(0.3, entry.occurrences.length * 0.05)
        + Math.max(0, 0.2 - entry.firstRank * 0.01)),
      evidence: entry.evidence, evidenceWarnings: [], discoveryOccurrences: entry.occurrences,
      searchCategories: [...entry.categories], suspectedRelationships: [], opportunitySignals: [],
    }));
  }
}
