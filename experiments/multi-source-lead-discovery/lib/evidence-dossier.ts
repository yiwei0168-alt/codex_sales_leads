import { createHash } from "node:crypto";

import { assessChannelMembershipEvidence, type ChannelMembershipLane } from "../../../src/lib/leads/channel-membership";
import { assessCooperationPathEvidence, type CooperationLane } from "../../../src/lib/leads/cooperation-path";
import { assessLeadEvidenceQuality } from "../../../src/lib/leads/evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../../../src/lib/leads/networking-relevance";

export type BenchmarkLane = "tier1-distribution" | "b2b-resale" | "project-services";
export type DossierEvidenceSourceType =
  | "official-company"
  | "official-platform-profile"
  | "authoritative-third-party"
  | "independent-public"
  | "discovery-summary";

export interface CandidatePoolEvidence {
  evidenceEntryId?: string;
  url?: string;
  excerpt?: string;
}

export interface CandidatePoolOccurrence {
  systemId: string;
  channelId: BenchmarkLane;
  rank: number;
  roles?: string[];
  score?: number;
  evidenceItems?: CandidatePoolEvidence[];
}

export interface CandidatePoolCompany {
  companyName: string;
  officialUrl: string | null;
  occurrenceCount?: number;
  occurrences: CandidatePoolOccurrence[];
}

export interface CandidatePoolArtifact {
  schemaVersion: number;
  runId: string;
  uniqueCompanyCount: number;
  submittedOccurrenceCount: number;
  companies: CandidatePoolCompany[];
}

export interface SharedEvidenceItem {
  evidenceId: string;
  url: string;
  excerpt: string;
  sourceType: DossierEvidenceSourceType;
  acquisition: "reused-discovery" | "direct-fetch" | "tavily-extract" | "fallback-search";
  capturedAt: string | null;
  sourceSystems: string[];
}

export interface DossierCollectionAttempt {
  stage: "seed" | "direct-official" | "extract-fallback" | "search-fallback";
  url: string | null;
  status: "reused" | "succeeded" | "failed" | "skipped";
  reason: string;
}

export interface SharedEvidenceDossier {
  dossierId: string;
  canonicalName: string;
  canonicalOfficialUrl: string | null;
  canonicalDomain: string | null;
  sourcePoolNames: string[];
  aliases: string[];
  legalIdentityAliases: string[];
  identityStatus: "resolved" | "unresolved" | "conflicting-official-domains";
  identityConflicts: string[];
  requestedLanes: BenchmarkLane[];
  submittedOccurrences: Array<{
    systemId: string;
    channelId: BenchmarkLane;
    rank: number;
    submittedRoles: string[];
  }>;
  evidence: SharedEvidenceItem[];
  evidenceProfileAssessment: ReturnType<typeof assessLeadEvidenceQuality>["smallLongTail"];
  claimCoverage: {
    identity: boolean;
    germanyPresence: boolean;
    activeNetworking: boolean;
    laneMembership: Record<BenchmarkLane, { requested: boolean; demonstrated: boolean; supportedRoles: string[] }>;
    cooperationPathCaps: Record<BenchmarkLane, number>;
  };
  enrichmentStatus: "seeded-needs-enrichment" | "partially-supported" | "ready-for-rescoring" | "identity-conflict";
  retrievalPlan: {
    officialPageBudget: 5;
    fallbackSourceBudget: 2;
    directFetchFirst: true;
    longTailEarlyStopAllowed: boolean;
    initialOfficialTargets: string[];
    pageIntents: string[];
    fallbackOrder: ["tavily-extract", "exa-or-search"];
  };
  collectionLog: DossierCollectionAttempt[];
}

export interface SharedDossierArtifact {
  schemaVersion: 1;
  policyVersion: "shared-provider-neutral-evidence-v1";
  runId: string;
  sourcePoolCompanyCount: number;
  canonicalCompanyCount: number;
  submittedOccurrenceCount: number;
  scoringViewExcludesDiscoverySummaries: true;
  companies: SharedEvidenceDossier[];
}

const platformHosts = [
  "linkedin.com", "facebook.com", "instagram.com", "google.com", "google.de",
  "amazon.com", "amazon.de", "ebay.com", "ebay.de", "kaufland.de",
];

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_|gclid$|fbclid$|ref$|source$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function host(value: string | null | undefined): string | null {
  const url = canonicalUrl(value);
  return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : null;
}

function isPlatformHost(value: string | null): boolean {
  return Boolean(value && platformHosts.some((entry) => value === entry || value.endsWith(`.${entry}`)));
}

function normalizedAlias(value: string): string {
  return value.toLowerCase()
    .replace(/\.(?:de|com|eu|net|org)\b/g, " ")
    .replace(/\b(?:gmbh|ag|kg|ug|mbh|se|co|ltd|limited|inc|corp|corporation|e\.k)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ").replace(/\s+/g, " ").trim();
}

function aliasesFor(company: CandidatePoolCompany): string[] {
  const values = [company.companyName, company.companyName.replace(/\([^)]*\)/g, " ")];
  for (const match of company.companyName.matchAll(/\(([^)]*)\)/g)) values.push(match[1]);
  const officialHost = host(company.officialUrl);
  if (officialHost && !isPlatformHost(officialHost)) values.push(officialHost.split(".")[0]);
  for (const occurrence of company.occurrences) {
    for (const item of occurrence.evidenceItems ?? []) {
      const itemUrl = canonicalUrl(item.url);
      if (!itemUrl) continue;
      const parsed = new URL(itemUrl);
      const itemHost = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const companyPath = parsed.pathname.match(/\/(?:company|place)\/([^/?#]+)/i)?.[1];
      if (companyPath && isPlatformHost(itemHost)) values.push(decodeURIComponent(companyPath));
    }
  }
  return [...new Set(values.map(normalizedAlias).filter((value) => value.length >= 5))];
}

function legalIdentityAliasesFor(company: CandidatePoolCompany): string[] {
  const values: string[] = [];
  if (/\b(?:gmbh|ag|kg|ug|mbh|se|ltd|limited|inc|corp|corporation|e\.k)\b/i.test(company.companyName)) {
    values.push(company.companyName);
  }
  for (const match of company.companyName.matchAll(/\(([^)]*)\)/g)) {
    if (/\b(?:gmbh|ag|kg|ug|mbh|se|ltd|limited|inc|corp|corporation|e\.k)\b/i.test(match[1])) values.push(match[1]);
  }
  return [...new Set(values.map(normalizedAlias).filter((value) => value.length >= 3))];
}

class DisjointSet {
  private readonly parents: number[];
  constructor(size: number) { this.parents = Array.from({ length: size }, (_, index) => index); }
  find(value: number): number {
    if (this.parents[value] !== value) this.parents[value] = this.find(this.parents[value]);
    return this.parents[value];
  }
  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents[rightRoot] = leftRoot;
  }
}

function sanitizeExcerpt(value: string): string {
  return value
    .replace(/(?:-|#{1,6})\s*Key Executives?\s*:[\s\S]*?(?=(?:-|#{1,6})\s*(?:Breakdown|Workforce|Company Details)\b|$)/gi,
      " [redacted-personnel-section] ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?\d[\d\s()./-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\s+/g, " ").trim().slice(0, 4_000);
}

function germanyPresence(excerpts: string[]): boolean {
  return excerpts.some((value) => /\b(?:germany|deutschland|german market|deutscher markt|headquartered in germany|sitz in deutschland)\b/iu.test(value));
}

function identityNameMatch(aliases: string[], legalAliases: string[], excerpts: string[]): boolean {
  const normalizedText = normalizedAlias(excerpts.join(" "));
  const brandMatched = aliases.some((alias) => alias.length >= 5 && normalizedText.includes(alias));
  const legalMatched = legalAliases.length === 0 || legalAliases.some((alias) => normalizedText.includes(alias));
  return brandMatched && legalMatched;
}

function membershipLane(lane: BenchmarkLane): ChannelMembershipLane {
  if (lane === "tier1-distribution") return "distribution";
  if (lane === "b2b-resale") return "resale";
  return "services";
}

function cooperationLane(lane: BenchmarkLane): CooperationLane {
  return lane;
}

function pageIntents(lanes: BenchmarkLane[]): string[] {
  const values = ["home/about", "imprint/contact", "networking products/brands"];
  if (lanes.includes("tier1-distribution")) values.push("distribution/reseller/partner portal");
  if (lanes.includes("b2b-resale")) values.push("shop/product listing/quotation/order");
  if (lanes.includes("project-services")) values.push("services/cases/design/deployment");
  return values;
}

export function refreshEvidenceDossier(dossier: SharedEvidenceDossier): SharedEvidenceDossier {
  const scoringEvidence = dossier.evidence.filter((item) => item.sourceType !== "discovery-summary");
  const evidenceQuality = assessLeadEvidenceQuality({
    candidateDomain: dossier.canonicalDomain,
    officialUrl: dossier.canonicalOfficialUrl,
    evidence: scoringEvidence.map((item) => ({ url: item.url, excerpt: item.excerpt, sourceType: item.sourceType })),
  });
  const excerpts = scoringEvidence.map((item) => item.excerpt);
  const nameMatched = identityNameMatch(dossier.aliases, dossier.legalIdentityAliases, excerpts);
  const networking = assessNetworkingRelevanceEvidence(excerpts);
  const laneMembership = Object.fromEntries((["tier1-distribution", "b2b-resale", "project-services"] as const)
    .map((lane) => {
      const assessment = assessChannelMembershipEvidence({ lane: membershipLane(lane), evidence: excerpts });
      return [lane, {
        requested: dossier.requestedLanes.includes(lane), demonstrated: assessment.demonstrated,
        supportedRoles: assessment.supportedRoles,
      }];
    })) as SharedEvidenceDossier["claimCoverage"]["laneMembership"];
  const cooperationPathCaps = Object.fromEntries(
    (["tier1-distribution", "b2b-resale", "project-services"] as const)
      .map((lane) => [lane, assessCooperationPathEvidence({ lane: cooperationLane(lane), evidence: excerpts }).cap]),
  ) as SharedEvidenceDossier["claimCoverage"]["cooperationPathCaps"];
  const requestedLanesSupported = dossier.requestedLanes.every((lane) => laneMembership[lane].demonstrated);
  const identitySupported = evidenceQuality.identityConsistent && nameMatched;
  const ready = evidenceQuality.sufficient && identitySupported && germanyPresence(excerpts)
    && networking.demonstrated && requestedLanesSupported;
  const anySupport = identitySupported || networking.demonstrated
    || Object.values(laneMembership).some((value) => value.demonstrated);
  return {
    ...dossier,
    evidenceProfileAssessment: evidenceQuality.smallLongTail,
    claimCoverage: {
      identity: identitySupported,
      germanyPresence: germanyPresence(excerpts),
      activeNetworking: networking.demonstrated,
      laneMembership,
      cooperationPathCaps,
    },
    enrichmentStatus: dossier.identityStatus === "conflicting-official-domains" ? "identity-conflict"
      : ready ? "ready-for-rescoring" : anySupport ? "partially-supported" : "seeded-needs-enrichment",
    retrievalPlan: {
      ...dossier.retrievalPlan,
      longTailEarlyStopAllowed: evidenceQuality.smallLongTail.exceptionEligible,
    },
  };
}

export function providerNeutralScoringEvidence(dossier: SharedEvidenceDossier): Array<Omit<SharedEvidenceItem, "sourceSystems">> {
  return dossier.evidence.filter((item) => item.sourceType !== "discovery-summary")
    .map((item) => ({
      evidenceId: item.evidenceId,
      url: item.url,
      excerpt: item.excerpt,
      sourceType: item.sourceType,
      acquisition: item.acquisition,
      capturedAt: item.capturedAt,
    }));
}

export function prepareSharedEvidenceDossiers(pool: CandidatePoolArtifact): SharedDossierArtifact {
  const aliases = pool.companies.map(aliasesFor);
  const officialHosts = pool.companies.map((company) => {
    const value = host(company.officialUrl);
    return value && !isPlatformHost(value) ? value : null;
  });
  const sets = new DisjointSet(pool.companies.length);
  for (let left = 0; left < pool.companies.length; left += 1) {
    for (let right = left + 1; right < pool.companies.length; right += 1) {
      const sameOfficialHost = Boolean(officialHosts[left] && officialHosts[left] === officialHosts[right]);
      const sharedAlias = aliases[left].some((value) => aliases[right].includes(value));
      const conflictingHosts = Boolean(officialHosts[left] && officialHosts[right] && officialHosts[left] !== officialHosts[right]);
      if (sameOfficialHost || (sharedAlias && !conflictingHosts)) sets.union(left, right);
    }
  }
  const groups = new Map<number, CandidatePoolCompany[]>();
  pool.companies.forEach((company, index) => {
    const root = sets.find(index);
    groups.set(root, [...(groups.get(root) ?? []), company]);
  });

  const companies = [...groups.values()].map((group): SharedEvidenceDossier => {
    const domains = [...new Set(group.map((company) => host(company.officialUrl)).filter((value): value is string => Boolean(value && !isPlatformHost(value))))];
    const canonicalDomain = domains.length === 1 ? domains[0] : null;
    const officialCandidates = group.map((company) => canonicalUrl(company.officialUrl))
      .filter((value): value is string => Boolean(value && (!canonicalDomain || host(value) === canonicalDomain)));
    const canonicalOfficialUrl = officialCandidates[0] ?? null;
    const groupAliases = [...new Set(group.flatMap(aliasesFor))].sort();
    const legalIdentityAliases = [...new Set(group.flatMap(legalIdentityAliasesFor))].sort();
    const canonicalName = [...group].sort((left, right) => {
      const leftOfficial = host(left.officialUrl) === canonicalDomain ? 1 : 0;
      const rightOfficial = host(right.officialUrl) === canonicalDomain ? 1 : 0;
      return rightOfficial - leftOfficial || right.companyName.length - left.companyName.length;
    })[0].companyName;
    const occurrences = group.flatMap((company) => company.occurrences);
    const requestedLanes = [...new Set(occurrences.map((item) => item.channelId))].sort() as BenchmarkLane[];
    const evidenceMap = new Map<string, SharedEvidenceItem>();
    for (const occurrence of occurrences) {
      for (const item of occurrence.evidenceItems ?? []) {
        const url = canonicalUrl(item.url);
        const excerpt = sanitizeExcerpt(item.excerpt ?? "");
        if (!url || !excerpt) continue;
        const key = `${url}\u0000${excerpt.toLowerCase()}`;
        const existing = evidenceMap.get(key);
        if (existing) existing.sourceSystems = [...new Set([...existing.sourceSystems, occurrence.systemId])].sort();
        else evidenceMap.set(key, {
          evidenceId: `SEED-${digest(key).slice(0, 12).toUpperCase()}`,
          url, excerpt, sourceType: "discovery-summary", acquisition: "reused-discovery",
          capturedAt: null, sourceSystems: [occurrence.systemId],
        });
      }
    }
    const initialTargets = [...new Set([
      canonicalOfficialUrl,
      ...[...evidenceMap.values()].map((item) => canonicalDomain && host(item.url) === canonicalDomain ? item.url : null),
    ].filter((value): value is string => Boolean(value)))].slice(0, 5);
    const emptyLaneMembership: SharedEvidenceDossier["claimCoverage"]["laneMembership"] = {
      "tier1-distribution": { requested: requestedLanes.includes("tier1-distribution"), demonstrated: false, supportedRoles: [] },
      "b2b-resale": { requested: requestedLanes.includes("b2b-resale"), demonstrated: false, supportedRoles: [] },
      "project-services": { requested: requestedLanes.includes("project-services"), demonstrated: false, supportedRoles: [] },
    };
    const dossier: SharedEvidenceDossier = {
      dossierId: `DOS-${digest(canonicalDomain ?? groupAliases[0] ?? canonicalName).slice(0, 12).toUpperCase()}`,
      canonicalName,
      canonicalOfficialUrl,
      canonicalDomain,
      sourcePoolNames: [...new Set(group.map((company) => company.companyName))].sort(),
      aliases: groupAliases,
      legalIdentityAliases,
      identityStatus: domains.length > 1 ? "conflicting-official-domains" : canonicalDomain ? "resolved" : "unresolved",
      identityConflicts: domains.length > 1 ? domains : [],
      requestedLanes,
      submittedOccurrences: occurrences.map((item) => ({
        systemId: item.systemId, channelId: item.channelId, rank: item.rank,
        submittedRoles: [...new Set(item.roles ?? [])],
      })).sort((left, right) => left.systemId.localeCompare(right.systemId)
        || left.channelId.localeCompare(right.channelId) || left.rank - right.rank),
      evidence: [...evidenceMap.values()],
      evidenceProfileAssessment: {
        profile: "standard", confidence: "none", exceptionEligible: false,
        directSizeSignals: [], structuralSignals: [], longTailSignals: [], largeCompanyOverrides: [],
        reason: "No claim evidence has been collected yet.",
      },
      claimCoverage: {
        identity: false, germanyPresence: false, activeNetworking: false,
        laneMembership: emptyLaneMembership,
        cooperationPathCaps: { "tier1-distribution": 2, "b2b-resale": 2, "project-services": 2 },
      },
      enrichmentStatus: domains.length > 1 ? "identity-conflict" : "seeded-needs-enrichment",
      retrievalPlan: {
        officialPageBudget: 5, fallbackSourceBudget: 2, directFetchFirst: true,
        longTailEarlyStopAllowed: false,
        initialOfficialTargets: initialTargets,
        pageIntents: pageIntents(requestedLanes),
        fallbackOrder: ["tavily-extract", "exa-or-search"],
      },
      collectionLog: [...evidenceMap.values()].map((item) => ({
        stage: "seed", url: item.url, status: "reused", reason: "Reused only to plan retrieval; excluded from scoring evidence.",
      })),
    };
    return refreshEvidenceDossier(dossier);
  }).sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));

  return {
    schemaVersion: 1,
    policyVersion: "shared-provider-neutral-evidence-v1",
    runId: pool.runId,
    sourcePoolCompanyCount: pool.companies.length,
    canonicalCompanyCount: companies.length,
    submittedOccurrenceCount: pool.submittedOccurrenceCount,
    scoringViewExcludesDiscoverySummaries: true,
    companies,
  };
}
