import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  prepareSharedEvidenceDossiers,
  refreshEvidenceDossier,
  type CandidatePoolArtifact,
  type CandidatePoolCompany,
  type SharedDossierArtifact,
  type SharedEvidenceDossier,
  type SharedEvidenceItem,
} from "../lib/evidence-dossier";

interface ControlConfig {
  runId: string;
  sourceRunId: string;
  systemId: string;
}

interface ResolvedCandidate {
  candidateId: string;
  resolutionStatus: "independent-official-page-confirmed" | "unresolved-no-independent-page";
  companyName: string;
  officialUrl: string | null;
  homepageEvidence: { url: string; excerpt: string; capturedAt: string } | null;
  occurrences: Array<{ channelId: "tier1-distribution" | "b2b-resale" | "project-services"; companyRank?: number }>;
}

interface ResolvedArtifact {
  candidates: ResolvedCandidate[];
}

interface CollectionRecord {
  dossierId: string;
  collectedAt: string;
  mode: "direct-only" | "direct-then-paid-fallback";
  officialPagesAttempted: number;
  officialPagesCollected: number;
  fallbackSourcesCollected: number;
  stoppedEarly: boolean;
  stopReason: string;
}

interface MasterArtifact {
  companies: SharedEvidenceDossier[];
  collectionResults: CollectionRecord[];
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function urlHost(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function mergeEvidence(values: SharedEvidenceItem[]): SharedEvidenceItem[] {
  return [...new Map(values.map((item) => [`${item.url}\u0000${item.excerpt.toLowerCase()}`, item])).values()];
}

function statusSummary(companies: SharedEvidenceDossier[], results: CollectionRecord[]) {
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

const root = path.resolve("experiments/multi-source-lead-discovery");
const config = JSON.parse(await readFile(path.join(root, "config/google-places-local-v1.3.json"), "utf8")) as ControlConfig;
const sourceRoot = path.join(root, "artifacts/runs", config.sourceRunId);
const targetRoot = path.join(root, "artifacts/runs", config.runId);
const [oldPool, oldMaster, resolved] = await Promise.all([
  readFile(path.join(sourceRoot, "evidence/deduplicated-candidate-pool.json"), "utf8").then((value) => JSON.parse(value) as CandidatePoolArtifact),
  readFile(path.join(sourceRoot, "evidence/shared-evidence-dossiers.v1.json"), "utf8").then((value) => JSON.parse(value) as MasterArtifact),
  readFile(path.join(targetRoot, "evidence/google-places-local-resolved-candidates.json"), "utf8").then((value) => JSON.parse(value) as ResolvedArtifact),
]);

const controlCompanies: CandidatePoolCompany[] = resolved.candidates.map((candidate) => {
  const laneRanks = new Map<string, number>();
  for (const occurrence of candidate.occurrences) {
    const rank = occurrence.companyRank ?? Number.MAX_SAFE_INTEGER;
    laneRanks.set(occurrence.channelId, Math.min(laneRanks.get(occurrence.channelId) ?? rank, rank));
  }
  return {
    companyName: candidate.companyName,
    officialUrl: candidate.officialUrl,
    occurrences: [...laneRanks].map(([channelId, rank]) => ({
      systemId: config.systemId,
      channelId: channelId as "tier1-distribution" | "b2b-resale" | "project-services",
      rank,
      roles: [],
      evidenceItems: [],
    })),
  };
});
const extendedPool: CandidatePoolArtifact = {
  schemaVersion: 1,
  runId: config.runId,
  uniqueCompanyCount: oldPool.companies.length + controlCompanies.length,
  submittedOccurrenceCount: oldPool.submittedOccurrenceCount
    + controlCompanies.reduce((sum, company) => sum + company.occurrences.length, 0),
  companies: [...oldPool.companies, ...controlCompanies],
};
const seed = prepareSharedEvidenceDossiers(extendedPool);
const oldByDomain = new Map(oldMaster.companies.flatMap((company) => company.canonicalDomain ? [[company.canonicalDomain, company] as const] : []));
const oldRecords = new Map(oldMaster.collectionResults.map((record) => [record.dossierId, record]));
const resolvedByDomain = new Map(resolved.candidates.flatMap((candidate) => {
  const domain = urlHost(candidate.officialUrl);
  return domain && candidate.homepageEvidence ? [[domain, candidate] as const] : [];
}));
const collectionResults: CollectionRecord[] = [];
const companies = seed.companies.map((seedCompany) => {
  const inherited = seedCompany.canonicalDomain ? oldByDomain.get(seedCompany.canonicalDomain) : undefined;
  let company = seedCompany;
  if (inherited) {
    company = {
      ...company,
      canonicalName: inherited.canonicalName,
      aliases: [...new Set([...company.aliases, ...inherited.aliases])].sort(),
      legalIdentityAliases: [...new Set([...company.legalIdentityAliases, ...inherited.legalIdentityAliases])].sort(),
      evidence: mergeEvidence([...company.evidence, ...inherited.evidence]),
      collectionLog: [...company.collectionLog, ...inherited.collectionLog],
    };
  }
  const resolvedCandidate = company.canonicalDomain ? resolvedByDomain.get(company.canonicalDomain) : undefined;
  if (resolvedCandidate?.homepageEvidence) {
    const evidence = resolvedCandidate.homepageEvidence;
    company.evidence = mergeEvidence([...company.evidence, {
      evidenceId: `GPL-WEB-${digest(`${evidence.url}\u0000${evidence.excerpt}`).slice(0, 12).toUpperCase()}`,
      url: evidence.url,
      excerpt: evidence.excerpt,
      sourceType: "official-company",
      acquisition: "direct-fetch",
      capturedAt: evidence.capturedAt,
      sourceSystems: [],
    }]);
    company.collectionLog.push({ stage: "direct-official", url: evidence.url, status: "succeeded",
      reason: "Independently fetched during Google Places company resolution; Places fields were not used as scoring evidence." });
  }
  company = refreshEvidenceDossier(company);
  if (inherited) {
    const record = oldRecords.get(inherited.dossierId);
    const laneSetUnchanged = inherited.requestedLanes.length === company.requestedLanes.length
      && inherited.requestedLanes.every((lane) => company.requestedLanes.includes(lane));
    if (record && laneSetUnchanged) collectionResults.push({ ...record, dossierId: company.dossierId });
  }
  return company;
});

const targetEvidenceRoot = path.join(targetRoot, "evidence");
await mkdir(targetEvidenceRoot, { recursive: true });
await writeFile(path.join(targetEvidenceRoot, "deduplicated-candidate-pool.json"), `${JSON.stringify(extendedPool, null, 2)}\n`, "utf8");
const seedBytes = Buffer.from(`${JSON.stringify({ ...seed, companies }, null, 2)}\n`, "utf8");
await writeFile(path.join(targetEvidenceRoot, "shared-evidence-dossiers.seed.json"), seedBytes);
const now = new Date().toISOString();
const master = {
  schemaVersion: 1,
  policyVersion: seed.policyVersion,
  runId: seed.runId,
  startedAt: now,
  updatedAt: now,
  mode: "resumable-provider-neutral-enrichment",
  sourceSeedSha256: digest(seedBytes),
  companies,
  collectionResults,
  summary: statusSummary(companies, collectionResults),
};
await writeFile(path.join(targetEvidenceRoot, "shared-evidence-dossiers.v1.json"), `${JSON.stringify(master, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sourceCanonicalCompanies: oldMaster.companies.length,
  googlePlacesCompanyGroups: controlCompanies.length,
  extendedCanonicalCompanies: companies.length,
  submittedOccurrences: extendedPool.submittedOccurrenceCount,
  inheritedCompletedDossiers: collectionResults.length,
  remainingDossiers: companies.length - collectionResults.length,
}, null, 2));
