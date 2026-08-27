export type EvidenceProfile = "standard" | "confirmed-small-long-tail" | "probable-small-long-tail";

export interface SmallLongTailEvidenceInput {
  url: string;
  excerpt: string;
  sourceType?: string;
}

export interface SmallLongTailSignal {
  kind: string;
  sourceUrl: string;
  detail: string;
}

export interface SmallLongTailAssessment {
  profile: EvidenceProfile;
  confidence: "high" | "medium" | "none";
  exceptionEligible: boolean;
  directSizeSignals: SmallLongTailSignal[];
  structuralSignals: SmallLongTailSignal[];
  longTailSignals: SmallLongTailSignal[];
  largeCompanyOverrides: SmallLongTailSignal[];
  reason: string;
}

export const SMALL_LONG_TAIL_POLICY = {
  version: "small-long-tail-evidence-v1",
  purpose: "This profile controls only the evidence-source admission threshold. It never changes fit, role, cooperation-path or evidence-reliability scores.",
  confirmedRule: "Confirmed small long-tail requires positive direct small-company evidence plus a long-tail public-information signal.",
  probableRule: "Probable small long-tail requires at least two different positive structural size signals plus a long-tail public-information signal. The signals may come from one identity-clear source; they are not a multiple-source requirement.",
  directSmallExamples: "Explicit 1-49 employee evidence, sole-proprietor or individual-enterprise status, or an explicit micro-enterprise status.",
  structuralExamples: "Owner-operated business, explicitly small team, explicitly limited locations, local/regional service scope, or operation through an official small storefront/marketplace profile.",
  longTailExamples: "Official marketplace, company/social or Google Business-style profile, local/regional business presentation, or another fragmented public-business footprint.",
  prohibitedInference: "Sparse search results, weak SEO, a simple website, low traffic, or missing employee/revenue/warehouse/brand information never proves small-company status.",
  largeOverride: "Explicit 250+ employees or a clearly large national branch/group footprint prevents the exception.",
  unknownRule: "When positive evidence is insufficient, use the standard profile. Missing evidence remains unknown and is never converted into small-company evidence.",
} as const;

const platformHosts = [
  "linkedin.com", "facebook.com", "instagram.com", "google.com", "google.de",
  "amazon.com", "amazon.de", "ebay.com", "ebay.de", "kaufland.de",
];

function hostFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isPlatformHost(host: string | null): boolean {
  return Boolean(host && platformHosts.some((value) => host === value || host.endsWith(`.${value}`)));
}

function isDiscoveryOnlyInput(item: SmallLongTailEvidenceInput): boolean {
  if (/^(?:discovery|search-snippet|provider-summary|ai-summary|discovery-summary)$/i.test(item.sourceType ?? "")) return true;
  try {
    const parsed = new URL(item.url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return ((host === "google.com" || host.startsWith("google.") || host === "bing.com")
      && parsed.pathname === "/search");
  } catch {
    return true;
  }
}

function signal(kind: string, sourceUrl: string, detail: string): SmallLongTailSignal {
  return { kind, sourceUrl, detail };
}

function uniqueSignals(values: SmallLongTailSignal[]): SmallLongTailSignal[] {
  return [...new Map(values.map((value) => [`${value.kind}\u0000${value.sourceUrl}`, value])).values()];
}

function employeeCounts(text: string): Array<{ minimum: number; maximum: number }> {
  const values: Array<{ minimum: number; maximum: number }> = [];
  const unit = String.raw`(?:employees?|people|staff|mitarbeiter(?:innen)?|beschäftigte)`;
  const rangePatterns = [
    new RegExp(String.raw`\b(\d{1,5})\s*(?:-|–|—|to|bis)\s*(\d{1,5})\s*${unit}\b`, "giu"),
    new RegExp(String.raw`\b${unit}\s*[:：]?\s*(\d{1,5})\s*(?:-|–|—|to|bis)\s*(\d{1,5})\b`, "giu"),
  ];
  for (const pattern of rangePatterns) {
    for (const match of text.matchAll(pattern)) {
      const left = Number(match[1]);
      const right = Number(match[2]);
      values.push({ minimum: Math.min(left, right), maximum: Math.max(left, right) });
    }
  }
  const exactPatterns = [
    new RegExp(String.raw`\b(\d{1,5})\s*${unit}\b`, "giu"),
    new RegExp(String.raw`\b${unit}\s*[:：]?\s*(\d{1,5})\b`, "giu"),
    new RegExp(String.raw`\b(?:employs?|has a team of|team of|beschäftigt|team aus)\s*(\d{1,5})\b`, "giu"),
  ];
  for (const pattern of exactPatterns) {
    for (const match of text.matchAll(pattern)) {
      const count = Number(match[1]);
      values.push({ minimum: count, maximum: count });
    }
  }
  return values.filter((value) => value.minimum > 0 && value.maximum >= value.minimum);
}

export function assessSmallLongTailProfile(evidence: SmallLongTailEvidenceInput[]): SmallLongTailAssessment {
  const directSizeSignals: SmallLongTailSignal[] = [];
  const structuralSignals: SmallLongTailSignal[] = [];
  const longTailSignals: SmallLongTailSignal[] = [];
  const largeCompanyOverrides: SmallLongTailSignal[] = [];

  for (const item of evidence) {
    const text = item.excerpt.toLowerCase().replace(/\s+/g, " ").trim();
    if (!text || isDiscoveryOnlyInput(item)) continue;
    const host = hostFromUrl(item.url);
    const counts = employeeCounts(text);
    if (counts.some((value) => value.maximum <= 49)) {
      directSizeSignals.push(signal("employees-1-49", item.url, "The source explicitly places the company within 1-49 employees."));
    }
    if (counts.some((value) => value.minimum >= 250 || value.maximum >= 250)
      || /\b(?:more than|over|mehr als|über)\s+\d{3,5}\s+(?:employees?|mitarbeiter(?:innen)?|beschäftigte)\b/iu.test(text)) {
      largeCompanyOverrides.push(signal("employees-250-plus", item.url, "The source explicitly indicates at least 250 employees."));
    }
    if (/\b(?:sole propriet(?:or|orship)|individual enterprise|einzelunternehmen|einzelkaufmann|einzelkauffrau|kleinstunternehmen)\b/iu.test(text)) {
      directSizeSignals.push(signal("micro-or-sole-proprietor-status", item.url, "The source explicitly identifies a sole-proprietor, individual-enterprise or micro-enterprise form."));
      longTailSignals.push(signal("micro-business-presentation", item.url, "The business is publicly presented as an individual or micro enterprise."));
    }
    if (/\b(?:owner[- ]operated|owner[- ]managed|owner[- ]run|inhabergeführt|inhabergeleitet)\b/iu.test(text)) {
      structuralSignals.push(signal("owner-operated", item.url, "The source explicitly describes an owner-operated business."));
    }
    if (/\b(?:small team|kleines team|überschaubares team)\b/iu.test(text)
      || counts.some((value) => value.maximum <= 50)) {
      structuralSignals.push(signal("small-team", item.url, "The source explicitly describes a small team or a team within 1-49 people."));
    }
    if (/\b(?:single (?:store|shop|location)|one (?:store|shop|location)|only (?:store|shop|location)|einziger standort|nur ein standort)\b/iu.test(text)) {
      structuralSignals.push(signal("limited-locations", item.url, "The source explicitly describes one operating location."));
    }
    if (/\b(?:locally owned|local (?:installer|provider|business|shop|store)|regional(?:ly)? (?:serving|operating|active)|regional tätig|regionaler (?:anbieter|dienstleister|fachhändler)|im raum [\p{L}-]+|vor ort (?:in|für))\b/iu.test(text)) {
      structuralSignals.push(signal("local-or-regional-scope", item.url, "The source explicitly presents a local or regional operating scope."));
      longTailSignals.push(signal("local-or-regional-footprint", item.url, "The public business presentation is local or regional."));
    }
    if (isPlatformHost(host) || item.sourceType?.toLowerCase() === "official-platform-profile") {
      structuralSignals.push(signal("official-platform-storefront", item.url, "The business operates through an identity-clear official platform profile or storefront."));
      longTailSignals.push(signal("platform-profile-footprint", item.url, "The available public business footprint includes an official platform profile or storefront."));
    }
    if (/\b(?:official (?:marketplace )?(?:store|shop)|our (?:ebay|amazon|kaufland) (?:store|shop)|marketplace seller)\b/iu.test(text)) {
      structuralSignals.push(signal("official-marketplace-storefront", item.url, "The source explicitly documents an official marketplace storefront."));
      longTailSignals.push(signal("marketplace-footprint", item.url, "The business is publicly represented through a marketplace storefront."));
    }
    if (/\b(?:nationwide network of|national branch network|hundreds of branches|thousands of employees|bundesweites filialnetz|mehr als \d+ niederlassungen|internationaler konzern|global enterprise group)\b/iu.test(text)) {
      largeCompanyOverrides.push(signal("large-branch-or-group-footprint", item.url, "The source explicitly describes a large national branch network or enterprise group footprint."));
    }
  }

  const direct = uniqueSignals(directSizeSignals);
  const structural = uniqueSignals(structuralSignals);
  const longTail = uniqueSignals(longTailSignals);
  const overrides = uniqueSignals(largeCompanyOverrides);
  if (overrides.length > 0) {
    return {
      profile: "standard", confidence: "none", exceptionEligible: false,
      directSizeSignals: direct, structuralSignals: structural, longTailSignals: longTail,
      largeCompanyOverrides: overrides,
      reason: "Explicit large-company evidence overrides the small long-tail exception.",
    };
  }
  if (direct.length > 0 && longTail.length > 0) {
    return {
      profile: "confirmed-small-long-tail", confidence: "high", exceptionEligible: true,
      directSizeSignals: direct, structuralSignals: structural, longTailSignals: longTail,
      largeCompanyOverrides: [],
      reason: "Positive direct small-company evidence and a long-tail public-information signal are both present.",
    };
  }
  if (new Set(structural.map((value) => value.kind)).size >= 2 && longTail.length > 0) {
    return {
      profile: "probable-small-long-tail", confidence: "medium", exceptionEligible: true,
      directSizeSignals: direct, structuralSignals: structural, longTailSignals: longTail,
      largeCompanyOverrides: [],
      reason: "At least two different positive structural size signals and a long-tail public-information signal are present.",
    };
  }
  return {
    profile: "standard", confidence: "none", exceptionEligible: false,
    directSizeSignals: direct, structuralSignals: structural, longTailSignals: longTail,
    largeCompanyOverrides: [],
    reason: "Positive evidence is insufficient to classify the company as small long-tail; missing public information was not treated as size evidence.",
  };
}
