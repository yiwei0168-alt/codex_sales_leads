import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { TavilySearchProvider } from "../../../src/providers/tavily";
import {
  collectEvidenceDossier,
  type EvidenceCollectionResult,
  type EvidenceFallbackAdapter,
  type EvidenceFallbackSource,
} from "../lib/evidence-collector";
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

interface CollectionRecord extends Omit<EvidenceCollectionResult, "dossier"> {
  dossierId: string;
  collectedAt: string;
  mode: "direct-only" | "direct-then-paid-fallback";
}

interface BatchCollectionRecord extends CollectionRecord {
  dossier: SharedEvidenceDossier;
}

interface CollectionSummary {
  canonicalTotal: number;
  completed: number;
  remaining: number;
  readyForRescoring: number;
  partiallySupported: number;
  stillNeedsEnrichment: number;
  identityConflicts: number;
  officialPagesAttempted: number;
  officialPagesCollected: number;
  fallbackSourcesCollected: number;
}

interface ResumableEvidenceArtifact {
  schemaVersion: 1;
  policyVersion: string;
  runId: string;
  startedAt: string;
  updatedAt: string;
  mode: "resumable-provider-neutral-enrichment";
  sourceSeedSha256: string;
  companies: SharedEvidenceDossier[];
  collectionResults: CollectionRecord[];
  summary: CollectionSummary;
}

function numberArgument(name: string, fallback: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const raw = argument(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function summary(companies: SharedEvidenceDossier[], results: CollectionRecord[]): CollectionSummary {
  return {
    canonicalTotal: companies.length,
    completed: results.length,
    remaining: companies.length - results.length,
    readyForRescoring: companies.filter((item) => item.enrichmentStatus === "ready-for-rescoring").length,
    partiallySupported: companies.filter((item) => item.enrichmentStatus === "partially-supported").length,
    stillNeedsEnrichment: companies.filter((item) => item.enrichmentStatus === "seeded-needs-enrichment").length,
    identityConflicts: companies.filter((item) => item.identityStatus === "conflicting-official-domains").length,
    officialPagesAttempted: results.reduce((sum, item) => sum + item.officialPagesAttempted, 0),
    officialPagesCollected: results.reduce((sum, item) => sum + item.officialPagesCollected, 0),
    fallbackSourcesCollected: results.reduce((sum, item) => sum + item.fallbackSourcesCollected, 0),
  };
}

async function readJsonIfPresent<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeManifest(options: {
  root: string;
  artifactRoot: string;
  seed: SharedDossierArtifact;
  seedPath: string;
  pilotPath: string;
  masterPath: string;
  lastMode: "direct-only" | "direct-then-paid-fallback";
  selection: Record<string, unknown>;
  summary: CollectionSummary | Record<string, number>;
}): Promise<void> {
  const candidates = [
    options.seedPath,
    options.pilotPath,
    options.masterPath,
    path.join(options.artifactRoot, "evidence/shared-evidence-fallback-queue.json"),
  ];
  const files = [];
  for (const filePath of candidates) {
    try {
      const bytes = await readFile(filePath);
      files.push({
        path: path.relative(options.root, filePath).replace(/\\/g, "/"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const master = await readJsonIfPresent<ResumableEvidenceArtifact>(options.masterPath);
  await writeFile(path.join(options.artifactRoot, "evidence/shared-evidence-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    runId: options.seed.runId,
    policyVersion: options.seed.policyVersion,
    files,
    collectionMode: options.lastMode,
    paidFallbackEnabled: options.lastMode === "direct-then-paid-fallback",
    paidFallbackEverUsed: Boolean(master?.collectionResults.some((item) => item.mode === "direct-then-paid-fallback")),
    selection: options.selection,
    summary: options.summary,
  }, null, 2)}\n`, "utf8");
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const runId = argument("run-id") ?? "2026-08-26-de-v1";
const limit = process.argv.includes("--all") ? Number.MAX_SAFE_INTEGER : numberArgument("limit", 10, 1);
const offset = numberArgument("offset", 0, 0);
const concurrency = numberArgument("concurrency", 3, 1, 3);
const match = argument("match")?.toLowerCase();
const allowPaidFallback = process.argv.includes("--allow-paid-fallback");
const retry = process.argv.includes("--retry");
const pilot = process.argv.includes("--pilot");
const fallbackOnly = process.argv.includes("--fallback-only");
const fallbackTier = numberArgument("fallback-tier", 1, 1, 3);
if (fallbackOnly && !allowPaidFallback) throw new Error("--fallback-only requires --allow-paid-fallback");
const artifactRoot = path.join(root, "artifacts/runs", runId);
const seedPath = path.join(artifactRoot, "evidence/shared-evidence-dossiers.seed.json");
const pilotPath = path.join(artifactRoot, "evidence/shared-evidence-direct-pilot.json");
const masterPath = path.join(artifactRoot, "evidence/shared-evidence-dossiers.v1.json");
const seedBytes = await readFile(seedPath);
const seed = JSON.parse(seedBytes.toString("utf8")) as SharedDossierArtifact;
const seedSha256 = createHash("sha256").update(seedBytes).digest("hex");
const existing = pilot ? null : await readJsonIfPresent<ResumableEvidenceArtifact>(masterPath);
if (existing && (existing.runId !== seed.runId || existing.policyVersion !== seed.policyVersion
  || existing.sourceSeedSha256 !== seedSha256)) {
  throw new Error("The resumable artifact does not match the current seed. Archive it before starting a new evidence policy or seed.");
}
const startedAt = existing?.startedAt ?? new Date().toISOString();
const companiesById = new Map((existing?.companies ?? seed.companies).map((company) => [company.dossierId, company]));
const resultsById = new Map((existing?.collectionResults ?? []).map((result) => [result.dossierId, result]));
if (companiesById.size !== seed.companies.length
  || seed.companies.some((company) => !companiesById.has(company.dossierId))) {
  throw new Error("The resumable artifact company set differs from the seed company set.");
}
function paidFallbackPriority(company: SharedEvidenceDossier): number | null {
  if (company.enrichmentStatus === "ready-for-rescoring" || company.enrichmentStatus === "identity-conflict") return null;
  const result = resultsById.get(company.dossierId);
  if (!result) return null;
  if (result.fallbackSourcesCollected >= company.retrievalPlan.fallbackSourceBudget) return null;
  if (!company.canonicalOfficialUrl || result.officialPagesCollected === 0
    || result.officialPagesCollected < result.officialPagesAttempted) return 1;
  if (company.enrichmentStatus === "seeded-needs-enrichment") return 2;
  return 3;
}

const eligible = seed.companies.filter((company) => {
  const matches = !match || company.canonicalName.toLowerCase().includes(match) || company.canonicalDomain?.includes(match);
  if (!matches) return false;
  if (fallbackOnly) {
    const priority = paidFallbackPriority(companiesById.get(company.dossierId)!);
    return priority !== null && priority <= fallbackTier;
  }
  return retry || pilot || !resultsById.has(company.dossierId);
});
const selected = eligible.slice(offset, offset + limit);
if (selected.length === 0 && (match || retry || pilot)) throw new Error("No evidence dossiers matched the requested selection");

const fetcher = new PublicPageFetcher();
const fallback = allowPaidFallback ? new PaidFallbackAdapter() : undefined;
const mode = allowPaidFallback ? "direct-then-paid-fallback" as const : "direct-only" as const;
const completedThisBatch: BatchCollectionRecord[] = [];
let checkpoint = Promise.resolve();

function masterArtifact(): ResumableEvidenceArtifact {
  const companies = seed.companies.map((company) => companiesById.get(company.dossierId)!);
  const collectionResults = seed.companies.flatMap((company) => {
    const result = resultsById.get(company.dossierId);
    return result ? [result] : [];
  });
  return {
    schemaVersion: 1,
    policyVersion: seed.policyVersion,
    runId,
    startedAt,
    updatedAt: new Date().toISOString(),
    mode: "resumable-provider-neutral-enrichment",
    sourceSeedSha256: seedSha256,
    companies,
    collectionResults,
    summary: summary(companies, collectionResults),
  };
}

async function checkpointMaster(): Promise<void> {
  await writeFile(masterPath, `${JSON.stringify(masterArtifact(), null, 2)}\n`, "utf8");
}

async function collectOne(seedDossier: SharedEvidenceDossier): Promise<void> {
  const collectedAt = new Date().toISOString();
  const input = companiesById.get(seedDossier.dossierId)!;
  const result = await collectEvidenceDossier(input, {
    pageFetcher: fetcher,
    fallbackAdapter: fallback,
    capturedAt: collectedAt,
    skipOfficial: fallbackOnly,
    signal: AbortSignal.timeout(180_000),
  });
  const { dossier, ...metrics } = result;
  const previous = resultsById.get(seedDossier.dossierId);
  const record: CollectionRecord = {
    dossierId: seedDossier.dossierId,
    collectedAt,
    mode,
    ...metrics,
    officialPagesAttempted: fallbackOnly ? (previous?.officialPagesAttempted ?? 0) + metrics.officialPagesAttempted : metrics.officialPagesAttempted,
    officialPagesCollected: fallbackOnly ? (previous?.officialPagesCollected ?? 0) + metrics.officialPagesCollected : metrics.officialPagesCollected,
    fallbackSourcesCollected: fallbackOnly ? (previous?.fallbackSourcesCollected ?? 0) + metrics.fallbackSourcesCollected : metrics.fallbackSourcesCollected,
  };
  companiesById.set(seedDossier.dossierId, result.dossier);
  resultsById.set(seedDossier.dossierId, record);
  completedThisBatch.push({ ...record, dossier });
  if (!pilot) {
    checkpoint = checkpoint.then(checkpointMaster);
    await checkpoint;
  }
  console.log(JSON.stringify({
    progress: `${completedThisBatch.length}/${selected.length}`,
    company: result.dossier.canonicalName,
    status: result.dossier.enrichmentStatus,
    official: `${result.officialPagesCollected}/${result.officialPagesAttempted}`,
    stopReason: result.stopReason,
  }));
}

await mkdir(path.dirname(masterPath), { recursive: true });
let nextIndex = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
  while (nextIndex < selected.length) {
    const dossier = selected[nextIndex++];
    await collectOne(dossier);
  }
}));
await checkpoint;

const selection = {
  offset,
  requestedLimit: limit === Number.MAX_SAFE_INTEGER ? "all" : limit,
  selected: selected.length,
  match: match ?? null,
  retry,
  fallbackOnly,
  fallbackTier: fallbackOnly ? fallbackTier : null,
  concurrency,
  totalCanonicalCompanies: seed.canonicalCompanyCount,
};
let outputPath = masterPath;
let outputSummary: CollectionSummary | Record<string, number>;
if (pilot) {
  outputPath = pilotPath;
  outputSummary = {
    readyForRescoring: completedThisBatch.filter((item) => item.dossier.enrichmentStatus === "ready-for-rescoring").length,
    partiallySupported: completedThisBatch.filter((item) => item.dossier.enrichmentStatus === "partially-supported").length,
    stillNeedsEnrichment: completedThisBatch.filter((item) => item.dossier.enrichmentStatus === "seeded-needs-enrichment").length,
    officialPagesAttempted: completedThisBatch.reduce((sum, item) => sum + item.officialPagesAttempted, 0),
    officialPagesCollected: completedThisBatch.reduce((sum, item) => sum + item.officialPagesCollected, 0),
    fallbackSourcesCollected: completedThisBatch.reduce((sum, item) => sum + item.fallbackSourcesCollected, 0),
  };
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    policyVersion: seed.policyVersion,
    runId,
    capturedAt: new Date().toISOString(),
    mode,
    selection,
    summary: outputSummary,
    results: completedThisBatch,
  }, null, 2)}\n`, "utf8");
} else {
  const output = masterArtifact();
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  outputSummary = output.summary;
}
await writeManifest({ root, artifactRoot, seed, seedPath, pilotPath, masterPath, lastMode: mode, selection, summary: outputSummary });
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), ...outputSummary }, null, 2));
