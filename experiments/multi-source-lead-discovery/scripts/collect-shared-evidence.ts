import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { TavilySearchProvider } from "../../../src/providers/tavily";
import { collectEvidenceDossier, type EvidenceFallbackAdapter, type EvidenceFallbackSource } from "../lib/evidence-collector";
import { type SharedDossierArtifact, type SharedEvidenceDossier } from "../lib/evidence-dossier";
import { createDiscoveryProvider } from "../lib/providers";
import { PublicPageFetcher } from "../lib/public-page-fetcher";

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function host(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function sourceType(url: string, dossier: SharedEvidenceDossier): EvidenceFallbackSource["sourceType"] {
  const value = host(url);
  if (value && dossier.canonicalDomain
    && (value === dossier.canonicalDomain || value.endsWith(`.${dossier.canonicalDomain}`))) return "official-company";
  if (value && ["linkedin.com", "facebook.com", "instagram.com", "google.com", "google.de", "ebay.de", "amazon.de", "kaufland.de"]
    .some((entry) => value === entry || value.endsWith(`.${entry}`))) return "official-platform-profile";
  return "independent-public";
}

class PaidFallbackAdapter implements EvidenceFallbackAdapter {
  private readonly tavily = process.env.TAVILY_API_KEY?.trim() ? new TavilySearchProvider({ maxAttempts: 2 }) : null;

  async collect(options: Parameters<EvidenceFallbackAdapter["collect"]>[0]) {
    const sources: EvidenceFallbackSource[] = [];
    const attempts: Array<{ url: string | null; succeeded: boolean; reason: string }> = [];
    if (this.tavily && options.failedOfficialUrls.length > 0) {
      try {
        const extraction = await this.tavily.extract(options.failedOfficialUrls.slice(0, options.remainingSourceBudget), options.signal);
        for (const item of extraction.results) {
          if (!item.rawContent.trim()) continue;
          sources.push({ url: item.url, text: item.rawContent, acquisition: "tavily-extract",
            sourceType: sourceType(item.url, options.dossier) });
          attempts.push({ url: item.url, succeeded: true, reason: "Tavily extracted the target page after direct retrieval failed." });
        }
        for (const url of extraction.failedUrls) attempts.push({ url, succeeded: false, reason: "Tavily extraction also failed." });
      } catch (error) {
        attempts.push({ url: null, succeeded: false,
          reason: `Tavily extraction failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    let remaining = options.remainingSourceBudget - sources.length;
    const query = [options.dossier.canonicalName, options.dossier.canonicalDomain,
      ...options.dossier.retrievalPlan.pageIntents, "Germany"].filter(Boolean).join(" ");
    if (remaining > 0 && this.tavily) {
      try {
        const search = await this.tavily.search({
          query, country: "germany", searchDepth: "advanced", maxResults: Math.min(remaining, 5),
          includeRawContent: true,
          includeDomains: options.dossier.canonicalDomain ? [options.dossier.canonicalDomain] : undefined,
        }, options.signal);
        for (const item of search.results) {
          if (!item.rawContent?.trim()) continue;
          sources.push({ url: item.url, text: item.rawContent, acquisition: "fallback-search",
            sourceType: sourceType(item.url, options.dossier) });
          attempts.push({ url: item.url, succeeded: true, reason: "Tavily search located and returned auditable raw page content; the search summary was not used." });
          if (sources.length >= options.remainingSourceBudget) break;
        }
      } catch (error) {
        attempts.push({ url: null, succeeded: false,
          reason: `Tavily evidence search failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    remaining = options.remainingSourceBudget - sources.length;
    if (remaining > 0 && process.env.EXA_API_KEY?.trim()) {
      try {
        const exa = createDiscoveryProvider("exa");
        const result = await exa.search({ query, countryCode: "DE", countryName: "Germany", languageCode: "de", maxResults: remaining }, options.signal);
        for (const item of result.items) {
          if (!item.url || item.snippet.trim().length < 24) continue;
          sources.push({ url: item.url, text: item.snippet, acquisition: "fallback-search",
            sourceType: sourceType(item.url, options.dossier) });
          attempts.push({ url: item.url, succeeded: true, reason: "Exa returned page content linked to an auditable URL." });
          if (sources.length >= options.remainingSourceBudget) break;
        }
      } catch (error) {
        attempts.push({ url: null, succeeded: false,
          reason: `Exa evidence search failed: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    if (sources.length === 0 && attempts.length === 0) {
      attempts.push({ url: null, succeeded: false, reason: "Neither Tavily nor Exa is configured for fallback evidence collection." });
    }
    return { sources: sources.slice(0, options.remainingSourceBudget), attempts };
  }
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const runId = argument("run-id") ?? "2026-08-26-de-v1";
const limit = Math.max(1, Number(argument("limit") ?? Number.MAX_SAFE_INTEGER));
const offset = Math.max(0, Number(argument("offset") ?? 0));
const match = argument("match")?.toLowerCase();
const allowPaidFallback = process.argv.includes("--allow-paid-fallback");
const artifactRoot = path.join(root, "artifacts/runs", runId);
const seedPath = path.join(artifactRoot, "evidence/shared-evidence-dossiers.seed.json");
const seed = JSON.parse(await readFile(seedPath, "utf8")) as SharedDossierArtifact;
const eligible = seed.companies.filter((company) => !match
  || company.canonicalName.toLowerCase().includes(match) || company.canonicalDomain?.includes(match));
const selected = eligible.slice(offset, offset + limit);
if (selected.length === 0) throw new Error("No evidence dossiers matched the requested selection");

const capturedAt = new Date().toISOString();
const fetcher = new PublicPageFetcher();
const fallback = allowPaidFallback ? new PaidFallbackAdapter() : undefined;
const results = [];
for (const dossier of selected) {
  results.push(await collectEvidenceDossier(dossier, {
    pageFetcher: fetcher, fallbackAdapter: fallback, capturedAt,
    signal: AbortSignal.timeout(180_000),
  }));
}
const limited = selected.length < seed.companies.length;
const outputPath = path.join(artifactRoot, "evidence", limited
  ? "shared-evidence-direct-pilot.json" : "shared-evidence-dossiers.v1.json");
const output = {
  schemaVersion: 1,
  policyVersion: seed.policyVersion,
  runId,
  capturedAt,
  mode: allowPaidFallback ? "direct-then-paid-fallback" : "direct-only",
  selection: { offset, limit: selected.length, match: match ?? null, totalCanonicalCompanies: seed.canonicalCompanyCount },
  summary: {
    readyForRescoring: results.filter((item) => item.dossier.enrichmentStatus === "ready-for-rescoring").length,
    partiallySupported: results.filter((item) => item.dossier.enrichmentStatus === "partially-supported").length,
    stillNeedsEnrichment: results.filter((item) => item.dossier.enrichmentStatus === "seeded-needs-enrichment").length,
    officialPagesAttempted: results.reduce((sum, item) => sum + item.officialPagesAttempted, 0),
    officialPagesCollected: results.reduce((sum, item) => sum + item.officialPagesCollected, 0),
    fallbackSourcesCollected: results.reduce((sum, item) => sum + item.fallbackSourcesCollected, 0),
  },
  results,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
const manifestPath = path.join(artifactRoot, "evidence/shared-evidence-manifest.json");
const [seedBytes, outputBytes] = await Promise.all([readFile(seedPath), readFile(outputPath)]);
await writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  runId,
  policyVersion: seed.policyVersion,
  files: [
    { path: path.relative(root, seedPath).replace(/\\/g, "/"), sha256: createHash("sha256").update(seedBytes).digest("hex") },
    { path: path.relative(root, outputPath).replace(/\\/g, "/"), sha256: createHash("sha256").update(outputBytes).digest("hex") },
  ],
  collectionMode: output.mode,
  paidFallbackEnabled: allowPaidFallback,
  selection: output.selection,
  summary: output.summary,
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), ...output.summary }, null, 2));
