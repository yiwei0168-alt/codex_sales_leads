import {
  assessSmallLongTailProfile,
  type EvidenceProfile,
  type SmallLongTailAssessment,
} from "./small-long-tail";

export type { EvidenceProfile } from "./small-long-tail";

export interface LeadEvidenceSourceInput {
  url: string;
  excerpt: string;
  sourceType?: string;
}

export interface LeadEvidenceQualityAssessment {
  sufficient: boolean;
  identityConsistent: boolean;
  profile: EvidenceProfile;
  qualifyingSourceCount: number;
  independentOriginCount: number;
  duplicateCount: number;
  discoveryOnlyCount: number;
  smallLongTail: SmallLongTailAssessment;
  reason: string;
}

export const LEAD_EVIDENCE_SOURCE_POLICY = {
  version: "claim-linked-evidence-v2-audited-small-long-tail",
  claimLinking: "Company identity, market presence, networking relevance, channel role and cooperation path must each be assessed from claim-linked URLs and excerpts; one generic description cannot prove every claim.",
  discoveryOnly: "Search snippets, provider summaries and AI-generated summaries may discover a candidate but cannot independently prove a claim.",
  directEvidence: "One clear company-owned official page may be sufficient; evidence quality is not a page-count contest.",
  standardAlternative: "Without direct official evidence, a standard candidate normally needs two non-duplicative public origins with concrete support.",
  longTailException: "A deterministically confirmed or probable small long-tail company does not need multiple independent sources. One identity-clear official marketplace store, official company/profile/social page, Google Business-style profile, or other concrete auditable public source may be sufficient.",
  longTailClassification: "The model cannot self-assign the exception. Confirmed requires positive direct small-company evidence plus a long-tail information signal; probable requires two different positive structural size signals plus a long-tail signal. Sparse search results, weak SEO, simple websites and missing data never prove size.",
  identityRule: "The company name, claimed official URL and evidence entity must refer to the same business. A supplied official URL with no matching entity evidence fails sufficient evidence until corrected.",
  duplicateRule: "Mirrors, repeated excerpts and pages from the same origin count once for corroboration.",
  scoringBoundary: "The single-source long-tail exception affects eligibility only. Independent corroboration can still support a higher evidence-reliability score, but its absence is not an automatic rejection.",
} as const;

const discoverySourceTypes = new Set(["discovery", "search-snippet", "provider-summary", "ai-summary"]);
const officialSourceTypes = new Set(["official-website", "official-company", "company-website"]);
const profileHosts = [
  "linkedin.com", "facebook.com", "instagram.com", "google.com", "google.de",
  "amazon.com", "amazon.de", "ebay.com", "ebay.de", "kaufland.de",
];

function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sameHostOrSubdomain(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function isProfileHost(host: string): boolean {
  return profileHosts.some((value) => host === value || host.endsWith(`.${value}`));
}

export function isDiscoveryOnlyLeadEvidence(item: LeadEvidenceSourceInput): boolean {
  if (discoverySourceTypes.has(item.sourceType?.toLowerCase() ?? "")) return true;
  try {
    const parsed = new URL(item.url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return ((host === "google.com" || host.startsWith("google.") || host === "bing.com")
      && parsed.pathname === "/search");
  } catch {
    return true;
  }
}

function normalizedExcerpt(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

function hasConcreteContent(value: string): boolean {
  const normalized = normalizedExcerpt(value);
  if (normalized.length < 24) return false;
  return !/^(?:home|official website|company profile|search result|learn more|welcome)(?: page)?$/.test(normalized);
}

export function assessLeadEvidenceQuality(options: {
  candidateDomain?: string | null;
  officialUrl?: string | null;
  evidence: LeadEvidenceSourceInput[];
}): LeadEvidenceQualityAssessment {
  const smallLongTail = assessSmallLongTailProfile(options.evidence);
  const profile: EvidenceProfile = smallLongTail.profile;
  const candidateHost = hostFromUrl(options.candidateDomain?.includes("://")
    ? options.candidateDomain : options.candidateDomain ? `https://${options.candidateDomain}` : null);
  const officialHost = hostFromUrl(options.officialUrl);
  const expectedHost = officialHost ?? candidateHost;
  const deduplicated: Array<LeadEvidenceSourceInput & { host: string; excerptKey: string }> = [];
  const seenUrls = new Set<string>();
  const seenExcerpts = new Set<string>();
  let duplicateCount = 0;

  for (const item of options.evidence) {
    const host = hostFromUrl(item.url);
    const excerptKey = normalizedExcerpt(item.excerpt);
    if (!host || !hasConcreteContent(item.excerpt)) continue;
    let canonicalUrl: string;
    try {
      const parsed = new URL(item.url);
      parsed.hash = "";
      for (const key of [...parsed.searchParams.keys()]) {
        if (/^(?:utm_|gclid$|fbclid$|ref$|source$)/i.test(key)) parsed.searchParams.delete(key);
      }
      canonicalUrl = parsed.toString();
    } catch {
      continue;
    }
    if (seenUrls.has(canonicalUrl) || seenExcerpts.has(excerptKey)) {
      duplicateCount += 1;
      continue;
    }
    seenUrls.add(canonicalUrl);
    seenExcerpts.add(excerptKey);
    deduplicated.push({ ...item, host, excerptKey });
  }

  const identityConsistent = expectedHost
    ? deduplicated.some((item) => sameHostOrSubdomain(item.host, expectedHost))
    : deduplicated.length > 0;
  const discoveryOnlyCount = deduplicated.filter(isDiscoveryOnlyLeadEvidence).length;
  const usable = deduplicated.filter((item) => !isDiscoveryOnlyLeadEvidence(item));
  const directOfficial = usable.filter((item) => {
    const declaredOfficial = officialSourceTypes.has(item.sourceType?.toLowerCase() ?? "");
    return !isProfileHost(item.host) && sameHostOrSubdomain(item.host, expectedHost) && (declaredOfficial || !item.sourceType);
  });
  const independent = usable.filter((item) => !directOfficial.includes(item));
  const independentOrigins = new Set(independent.map((item) => item.host));
  const longTailSingleSource = smallLongTail.exceptionEligible
    && usable.some((item) => isProfileHost(item.host) || independent.includes(item));
  const sufficient = identityConsistent
    && (directOfficial.length > 0 || independentOrigins.size >= 2 || longTailSingleSource);

  let reason: string;
  if (!identityConsistent) {
    reason = "The claimed official identity/domain was not matched by the supplied evidence.";
  } else if (directOfficial.length > 0) {
    reason = "A concrete source matching the company-owned official identity was supplied.";
  } else if (independentOrigins.size >= 2) {
    reason = "Two non-duplicative public origins provide concrete support.";
  } else if (longTailSingleSource) {
    reason = "The long-tail small-company exception accepts one identity-clear, concrete and auditable public source.";
  } else if (discoveryOnlyCount > 0 && usable.length === 0) {
    reason = "Only discovery/search-provider summaries were supplied; they do not independently prove candidate claims.";
  } else {
    reason = "The supplied sources did not meet the standard evidence floor; no long-tail single-source exception was established.";
  }

  return {
    sufficient,
    identityConsistent,
    profile,
    qualifyingSourceCount: directOfficial.length + independentOrigins.size,
    independentOriginCount: independentOrigins.size,
    duplicateCount,
    discoveryOnlyCount,
    smallLongTail,
    reason,
  };
}
