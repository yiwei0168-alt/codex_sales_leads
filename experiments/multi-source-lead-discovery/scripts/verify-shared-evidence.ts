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

const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-26-de-v1/evidence");
const seed = JSON.parse(await readFile(path.join(root, "shared-evidence-dossiers.seed.json"), "utf8")) as SharedDossierArtifact;
const pilot = JSON.parse(await readFile(path.join(root, "shared-evidence-direct-pilot.json"), "utf8")) as PilotArtifact;
const manifest = JSON.parse(await readFile(path.join(root, "shared-evidence-manifest.json"), "utf8")) as EvidenceManifest;

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
assert(manifest.runId === seed.runId && manifest.paidFallbackEnabled === false,
  "The committed pilot manifest must identify the run and confirm paid fallback was disabled");
for (const file of manifest.files) {
  const bytes = await readFile(path.join(path.resolve("experiments/multi-source-lead-discovery"), file.path));
  assert(createHash("sha256").update(bytes).digest("hex") === file.sha256, `Artifact hash mismatch: ${file.path}`);
}
assert(pilot.results.every((result) => result.officialPagesAttempted <= 5 && result.fallbackSourcesCollected <= 2),
  "Pilot collection exceeded a per-company budget");
assert(pilot.results.flatMap((result) => providerNeutralScoringEvidence(result.dossier))
  .every((item) => !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item.excerpt)
    && !/(?:\+?\d[\d\s()./-]{7,}\d)/.test(item.excerpt)), "Pilot evidence contains an unredacted contact");

console.log(JSON.stringify({
  runId: seed.runId,
  sourcePoolCompanyCount: seed.sourcePoolCompanyCount,
  canonicalCompanyCount: seed.canonicalCompanyCount,
  submittedOccurrenceCount: seed.submittedOccurrenceCount,
  crossPoolMerges: seed.companies.filter((company) => company.sourcePoolNames.length > 1).length,
  discoveryItemsAdmittedToScoring: seed.companies.reduce((sum, company) => sum + providerNeutralScoringEvidence(company).length, 0),
  pilotMode: pilot.mode,
  pilotOfficialPagesAttempted: pilot.summary.officialPagesAttempted,
  pilotOfficialPagesCollected: pilot.summary.officialPagesCollected,
  pilotFallbackSourcesCollected: pilot.summary.fallbackSourcesCollected,
  pilotStatuses: pilot.results.map((result) => ({
    company: result.dossier.canonicalName,
    status: result.dossier.enrichmentStatus,
    identitySupported: result.dossier.claimCoverage.identity,
  })),
}, null, 2));
