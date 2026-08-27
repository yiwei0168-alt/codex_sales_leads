import { createHash } from "node:crypto";

import { refreshEvidenceDossier, type SharedEvidenceDossier, type SharedEvidenceItem } from "./evidence-dossier";

export interface CollectedPage {
  url: string;
  text: string;
  links: string[];
}

export interface EvidencePageFetcher {
  fetch(url: string, signal?: AbortSignal): Promise<CollectedPage>;
}

export interface EvidenceFallbackSource {
  url: string;
  text: string;
  acquisition: "tavily-extract" | "fallback-search";
  sourceType: "official-company" | "official-platform-profile" | "authoritative-third-party" | "independent-public";
}

export interface EvidenceFallbackAdapter {
  collect(options: {
    dossier: SharedEvidenceDossier;
    failedOfficialUrls: string[];
    remainingSourceBudget: number;
    signal?: AbortSignal;
  }): Promise<{ sources: EvidenceFallbackSource[]; attempts: Array<{ url: string | null; succeeded: boolean; reason: string }> }>;
}

export interface EvidenceCollectionResult {
  dossier: SharedEvidenceDossier;
  officialPagesAttempted: number;
  officialPagesCollected: number;
  fallbackSourcesCollected: number;
  stoppedEarly: boolean;
  stopReason: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function host(value: string): string | null {
  const url = canonicalUrl(value);
  return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : null;
}

function sameCompanyHost(url: string, domain: string | null): boolean {
  const value = host(url);
  return Boolean(value && domain && (value === domain || value.endsWith(`.${domain}`) || domain.endsWith(`.${value}`)));
}

function linkPriority(url: string, intents: string[]): number {
  const text = `${url} ${intents.join(" ")}`.toLowerCase();
  const keywords: Array<[string, number]> = [
    ["impressum", 12], ["about", 10], ["unternehmen", 10], ["company", 10], ["kontakt", 8], ["contact", 8],
    ["network", 5], ["netzwerk", 5], ["wlan", 5], ["router", 4], ["switch", 4],
    ["product", 4], ["produkt", 4], ["brand", 4], ["marke", 4],
    ["partner", 4], ["reseller", 4], ["distribution", 4], ["distributor", 4], ["haendler", 4], ["händler", 4], ["wholesale", 4],
    ["shop", 3], ["store", 3], ["quote", 3], ["angebot", 3], ["order", 3], ["bestellen", 3],
    ["service", 3], ["leistung", 3], ["projekt", 3], ["reference", 3], ["referenz", 3], ["install", 3], ["deployment", 3], ["planung", 3],
  ];
  return keywords.reduce((score, [keyword, weight]) => score
    + (text.includes(keyword) && url.toLowerCase().includes(keyword) ? weight : 0), 0);
}

function sanitizeEvidenceText(value: string): string {
  const sanitized = value
    .replace(/(?:Wie wir Cookies|Datenschutz-Einstellungen|Cookie Settings|Manage consent)[\s\S]*$/iu, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?\d[\d\s()./-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\s+/g, " ").trim();
  if (sanitized.length <= 6_000) return sanitized;
  const windows: Array<[number, number]> = [[0, 1_000], [Math.max(0, sanitized.length - 1_200), sanitized.length]];
  const keywords = /\b(?:gmbh|ag|kg|ug|company|unternehmen|impressum|germany|deutschland|employees?|mitarbeiter|owner|inhaber|router|gateway|wlan|wireless|access point|switch|poe|distributor|reseller|händler|wholesale|shop|bestellen|quote|angebot|planung|design|install|deployment|projekt|service)\b/giu;
  for (const match of sanitized.matchAll(keywords)) {
    if (match.index === undefined) continue;
    windows.push([Math.max(0, match.index - 180), Math.min(sanitized.length, match.index + 420)]);
    if (windows.length >= 14) break;
  }
  const merged = windows.sort((left, right) => left[0] - right[0]).reduce<Array<[number, number]>>((values, window) => {
    const previous = values.at(-1);
    if (previous && window[0] <= previous[1] + 80) previous[1] = Math.max(previous[1], window[1]);
    else values.push([...window]);
    return values;
  }, []);
  return merged.map(([start, end]) => sanitized.slice(start, end).trim()).filter(Boolean).join(" […] ").slice(0, 6_000);
}

function addEvidence(dossier: SharedEvidenceDossier, item: Omit<SharedEvidenceItem, "evidenceId" | "sourceSystems">): void {
  const url = canonicalUrl(item.url);
  const excerpt = sanitizeEvidenceText(item.excerpt);
  if (!url || excerpt.length < 24) return;
  const existing = dossier.evidence.some((value) => value.sourceType !== "discovery-summary"
    && value.url === url && value.excerpt.toLowerCase() === excerpt.toLowerCase());
  if (existing) return;
  dossier.evidence.push({
    ...item,
    url,
    excerpt,
    evidenceId: `EVID-${digest(`${url}\u0000${excerpt}`).slice(0, 12).toUpperCase()}`,
    sourceSystems: [],
  });
}

function requestedPathSupported(dossier: SharedEvidenceDossier): boolean {
  return dossier.requestedLanes.every((lane) => dossier.claimCoverage.cooperationPathCaps[lane] >= 3);
}

function mayStop(dossier: SharedEvidenceDossier): boolean {
  if (dossier.enrichmentStatus !== "ready-for-rescoring") return false;
  return dossier.evidenceProfileAssessment.exceptionEligible || requestedPathSupported(dossier);
}

export async function collectEvidenceDossier(
  input: SharedEvidenceDossier,
  options: {
    pageFetcher: EvidencePageFetcher;
    fallbackAdapter?: EvidenceFallbackAdapter;
    capturedAt: string;
    skipOfficial?: boolean;
    signal?: AbortSignal;
  },
): Promise<EvidenceCollectionResult> {
  let dossier = structuredClone(input);
  if (dossier.identityStatus === "conflicting-official-domains") {
    dossier.collectionLog.push({ stage: "direct-official", url: null, status: "skipped", reason: "Resolve conflicting official domains before enrichment." });
    return { dossier, officialPagesAttempted: 0, officialPagesCollected: 0, fallbackSourcesCollected: 0,
      stoppedEarly: true, stopReason: "identity-conflict" };
  }
  const queue = [...dossier.retrievalPlan.initialOfficialTargets];
  if (dossier.canonicalOfficialUrl && !queue.includes(dossier.canonicalOfficialUrl)) queue.unshift(dossier.canonicalOfficialUrl);
  const seen = new Set<string>();
  const failedOfficialUrls: string[] = options.skipOfficial
    ? dossier.collectionLog.filter((item) => item.stage === "direct-official" && item.status === "failed" && item.url)
      .map((item) => item.url!)
    : [];
  let officialPagesAttempted = 0;
  let officialPagesCollected = 0;
  let stoppedEarly = false;
  let stopReason = "official-page-budget-exhausted";

  while (!options.skipOfficial && queue.length > 0 && officialPagesAttempted < dossier.retrievalPlan.officialPageBudget) {
    const target = canonicalUrl(queue.shift()!);
    if (!target || seen.has(target) || !sameCompanyHost(target, dossier.canonicalDomain)) continue;
    seen.add(target);
    officialPagesAttempted += 1;
    try {
      const page = await options.pageFetcher.fetch(target, options.signal);
      if (!sameCompanyHost(page.url, dossier.canonicalDomain)) throw new Error("Redirected outside the canonical company domain");
      addEvidence(dossier, {
        url: page.url, excerpt: page.text, sourceType: "official-company", acquisition: "direct-fetch",
        capturedAt: options.capturedAt,
      });
      officialPagesCollected += 1;
      dossier.collectionLog.push({ stage: "direct-official", url: page.url, status: "succeeded", reason: "Fetched directly from the canonical company domain." });
      const newLinks = page.links.filter((url) => sameCompanyHost(url, dossier.canonicalDomain) && !seen.has(url))
        .sort((left, right) => linkPriority(right, dossier.retrievalPlan.pageIntents) - linkPriority(left, dossier.retrievalPlan.pageIntents));
      for (const link of newLinks) if (!queue.includes(link)) queue.push(link);
      dossier = refreshEvidenceDossier(dossier);
      if (mayStop(dossier)) {
        stoppedEarly = true;
        stopReason = dossier.evidenceProfileAssessment.exceptionEligible
          ? "long-tail-single-source-or-early-complete" : "required-claims-and-cooperation-path-supported";
        break;
      }
    } catch (error) {
      failedOfficialUrls.push(target);
      dossier.collectionLog.push({
        stage: "direct-official", url: target, status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let fallbackSourcesCollected = 0;
  const existingFallbackSources = dossier.evidence.filter((item) => item.acquisition === "tavily-extract"
    || item.acquisition === "fallback-search").length;
  const remainingFallbackBudget = Math.max(0, dossier.retrievalPlan.fallbackSourceBudget - existingFallbackSources);
  if (!mayStop(dossier) && options.fallbackAdapter && remainingFallbackBudget > 0) {
    try {
      const fallback = await options.fallbackAdapter.collect({
        dossier, failedOfficialUrls,
        remainingSourceBudget: remainingFallbackBudget,
        signal: options.signal,
      });
      for (const source of fallback.sources.slice(0, remainingFallbackBudget)) {
        addEvidence(dossier, { ...source, excerpt: source.text, capturedAt: options.capturedAt });
        fallbackSourcesCollected += 1;
      }
      dossier.collectionLog.push(...fallback.attempts.map((attempt) => ({
        stage: attempt.url && failedOfficialUrls.includes(attempt.url) ? "extract-fallback" as const : "search-fallback" as const,
        url: attempt.url,
        status: attempt.succeeded ? "succeeded" as const : "failed" as const,
        reason: attempt.reason,
      })));
      dossier = refreshEvidenceDossier(dossier);
      if (mayStop(dossier)) {
        stoppedEarly = true;
        stopReason = "fallback-completed-required-claims";
      } else {
        stopReason = "evidence-budget-exhausted-with-unknowns";
      }
    } catch (error) {
      dossier.collectionLog.push({ stage: "search-fallback", url: null, status: "failed",
        reason: error instanceof Error ? error.message : String(error) });
      stopReason = "fallback-failed-unknowns-preserved";
    }
  } else if (!mayStop(dossier) && options.fallbackAdapter && remainingFallbackBudget === 0) {
    dossier.collectionLog.push({ stage: "search-fallback", url: null, status: "skipped", reason: "The per-company fallback source budget is exhausted." });
    stopReason = "fallback-budget-already-exhausted";
  } else if (!mayStop(dossier) && !options.fallbackAdapter) {
    dossier.collectionLog.push({ stage: "search-fallback", url: null, status: "skipped", reason: "No fallback adapter was configured." });
    stopReason = "fallback-not-configured";
  } else if (options.skipOfficial && mayStop(dossier)) {
    stopReason = "fallback-skipped-already-complete";
  }

  return { dossier, officialPagesAttempted, officialPagesCollected, fallbackSourcesCollected, stoppedEarly, stopReason };
}
