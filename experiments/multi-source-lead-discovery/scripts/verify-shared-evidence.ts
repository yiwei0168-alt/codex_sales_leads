import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { providerNeutralScoringEvidence, type SharedDossierArtifact } from "../lib/evidence-dossier";

interface PilotArtifact {
  runId: string;
  mode: string;
  summary: { officialPagesAttempted: number; officialPagesCollected: number; fallbackSourcesCollected: number };
  results: Array<{ dossier: SharedDossierArtifact["companies"][number]; officialPagesAttempted: number; fallbackSourcesCollected: number }>;
}

interface EvidenceManifest {
  runId: string;
  paidFallbackEnabled: boolean;
  files: Array<{ path: string; sha256: string }>;
}

interface MasterArtifact {
  runId: string;
  policyVersion: string;
  sourceSeedSha256: string;
  companies: SharedDossierArtifact["companies"];
  collectionResults: Array<{
    dossierId: string;
    mode: "direct-only" | "direct-then-paid-fallback";
    officialPagesAttempted: number;
    officialPagesCollected: number;
    fallbackSourcesCollected: number;
  }>;
  summary: {
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
  };
}

const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-26-de-v1/evidence");
const seed = JSON.parse(await readFile(path.join(root, "shared-evidence-dossiers.seed.json"), "utf8")) as SharedDossierArtifact;
const pilot = JSON.parse(await readFile(path.join(root, "shared-evidence-direct-pilot.json"), "utf8")) as PilotArtifact;
const manifest = JSON.parse(await readFile(path.join(root, "shared-evidence-manifest.json"), "utf8")) as EvidenceManifest;
const masterPath = path.join(root, "shared-evidence-dossiers.v1.json");
const master = await readFile(masterPath, "utf8").then((value) => JSON.parse(value) as MasterArtifact).catch((error) => {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
  throw error;
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(seed.sourcePoolCompanyCount === 119, "Expected the frozen 119-company source pool");
assert(seed.canonicalCompanyCount === 113, "Expected 113 canonical dossiers after audited alias merging");
assert(seed.submittedOccurrenceCount === 163, "Expected all 163 submitted occurrences to remain bound");
assert(new Set(seed.companies.map((company) => company.dossierId)).size === seed.companies.length, "Dossier IDs must be unique");
assert(seed.companies.reduce((sum, company) => sum + company.submittedOccurrences.length, 0) === 163,
  "Every submitted occurrence must be assigned exactly once");
assert(seed.companies.every((company) => company.retrievalPlan.officialPageBudget === 5
  && company.retrievalPlan.fallbackSourceBudget === 2), "Every dossier must use the confirmed 5+2 budget");
assert(seed.companies.every((company) => providerNeutralScoringEvidence(company).length === 0),
  "Reused discovery material must not enter the provider-neutral scoring view");
assert(pilot.runId === seed.runId, "Pilot and seed run IDs must match");
assert(manifest.runId === seed.runId, "The evidence manifest must identify the frozen run");
assert(pilot.mode === "direct-only", "The committed direct pilot must confirm paid fallback was disabled");
for (const file of manifest.files) {
  const bytes = await readFile(path.join(path.resolve("experiments/multi-source-lead-discovery"), file.path));
  assert(createHash("sha256").update(bytes).digest("hex") === file.sha256, `Artifact hash mismatch: ${file.path}`);
}
assert(pilot.results.every((result) => result.officialPagesAttempted <= 5 && result.fallbackSourcesCollected <= 2),
  "Pilot collection exceeded a per-company budget");
assert(pilot.results.flatMap((result) => providerNeutralScoringEvidence(result.dossier))
  .every((item) => !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item.excerpt)
    && !/(?:\+?\d[\d\s()./-]{7,}\d)/.test(item.excerpt)), "Pilot evidence contains an unredacted contact");

if (master) {
  const resultIds = new Set(master.collectionResults.map((result) => result.dossierId));
  const companyIds = new Set(master.companies.map((company) => company.dossierId));
  assert(master.runId === seed.runId && master.policyVersion === seed.policyVersion,
    "Master artifact and seed policy identities must match");
  assert(master.sourceSeedSha256 === createHash("sha256").update(await readFile(path.join(root, "shared-evidence-dossiers.seed.json"))).digest("hex"),
    "Master artifact must bind to the exact seed bytes");
  assert(master.companies.length === 113 && companyIds.size === 113, "Master artifact must preserve all 113 canonical companies once");
  assert(master.companies.reduce((sum, company) => sum + company.submittedOccurrences.length, 0) === 163,
    "Master artifact must preserve all 163 submitted occurrences");
  assert(resultIds.size === master.collectionResults.length
    && master.collectionResults.every((result) => companyIds.has(result.dossierId)),
  "Collection records must be unique and reference a canonical dossier");
  assert(master.collectionResults.every((result) => result.officialPagesAttempted <= 5
    && result.officialPagesCollected <= result.officialPagesAttempted && result.fallbackSourcesCollected <= 2),
  "Master collection exceeded a per-company source budget");
  assert(master.summary.canonicalTotal === 113
    && master.summary.completed === master.collectionResults.length
    && master.summary.remaining === 113 - master.collectionResults.length,
  "Master completion summary is inconsistent");
  assert(master.summary.readyForRescoring === master.companies.filter((item) => item.enrichmentStatus === "ready-for-rescoring").length
    && master.summary.partiallySupported === master.companies.filter((item) => item.enrichmentStatus === "partially-supported").length
    && master.summary.stillNeedsEnrichment === master.companies.filter((item) => item.enrichmentStatus === "seeded-needs-enrichment").length,
  "Master enrichment status summary is inconsistent");
  assert(master.companies.flatMap(providerNeutralScoringEvidence)
    .every((item) => !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item.excerpt)
      && !/(?:\+?\d[\d\s()./-]{7,}\d)/.test(item.excerpt)), "Master evidence contains an unredacted contact");
}

console.log(JSON.stringify({
  runId: seed.runId,
  sourcePoolCompanyCount: seed.sourcePoolCompanyCount,
  canonicalCompanyCount: seed.canonicalCompanyCount,
  submittedOccurrenceCount: seed.submittedOccurrenceCount,
  crossPoolMerges: seed.companies.filter((company) => company.sourcePoolNames.length > 1).length,
  discoveryItemsAdmittedToScoring: seed.companies.reduce((sum, company) => sum + providerNeutralScoringEvidence(company).length, 0),
  pilotMode: pilot.mode,
  lastCollectionPaidFallbackEnabled: manifest.paidFallbackEnabled,
  pilotOfficialPagesAttempted: pilot.summary.officialPagesAttempted,
  pilotOfficialPagesCollected: pilot.summary.officialPagesCollected,
  pilotFallbackSourcesCollected: pilot.summary.fallbackSourcesCollected,
  masterCompleted: master?.summary.completed ?? 0,
  masterRemaining: master?.summary.remaining ?? seed.canonicalCompanyCount,
  masterOfficialPagesCollected: master?.summary.officialPagesCollected ?? 0,
  masterFallbackSourcesCollected: master?.summary.fallbackSourcesCollected ?? 0,
  pilotStatuses: pilot.results.map((result) => ({
    company: result.dossier.canonicalName,
    status: result.dossier.enrichmentStatus,
    identitySupported: result.dossier.claimCoverage.identity,
  })),
}, null, 2));
