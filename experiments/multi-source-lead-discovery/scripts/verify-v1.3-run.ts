import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { providerNeutralScoringEvidence, type SharedDossierArtifact } from "../lib/evidence-dossier";

interface MasterArtifact extends SharedDossierArtifact {
  sourceSeedSha256: string;
  collectionResults: Array<{
    dossierId: string;
    officialPagesAttempted: number;
    officialPagesCollected: number;
    fallbackSourcesCollected: number;
  }>;
  summary: { canonicalTotal: number; completed: number; remaining: number };
}

interface ScoreArtifact {
  runId: string;
  summary: {
    canonicalCompanies: number;
    uniqueSystemLaneCompanyOccurrences: number;
    duplicateCanonicalOccurrencesSuppressed: number;
    eligibleOccurrences: number;
    rejectedOccurrences: number;
  };
  scores: Array<{ dossierId: string; systemId: string; channelId: string; score: number; failedGates: string[] }>;
}

interface BlindPacket {
  runId: string;
  candidates: Array<{
    blindCandidateId: string;
    reviewLane: string;
    evidenceItems: Array<{ sourceType: string }>;
  }>;
}

function assertBlind(value: unknown, location = "packet"): void {
  const forbidden = new Set(["systemId", "provider", "providerId", "rank", "submittedRank", "score", "modelScore", "occurrenceCount", "sampleType"]);
  if (Array.isArray(value)) return value.forEach((item, index) => assertBlind(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert(!forbidden.has(key), `Blind packet leaked ${location}.${key}`);
    assertBlind(child, `${location}.${key}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId);
const seedBytes = await readFile(path.join(root, "evidence/shared-evidence-dossiers.seed.json"));
const seed = JSON.parse(seedBytes.toString("utf8")) as SharedDossierArtifact;
const master = JSON.parse(await readFile(path.join(root, "evidence/shared-evidence-dossiers.v1.json"), "utf8")) as MasterArtifact;
const scores = JSON.parse(await readFile(path.join(root, "scoring/all-candidate-scores.json"), "utf8")) as ScoreArtifact;
const blindPacket = JSON.parse(await readFile(path.join(root, "scoring/blind-audit-packet.json"), "utf8")) as BlindPacket;

assert(seed.runId === runId && master.runId === runId && scores.runId === runId, "Every artifact must use the target run ID");
assert(seed.canonicalCompanyCount === 465 && seed.submittedOccurrenceCount === 555,
  "The v1.3 seed must preserve the frozen 465 canonical companies and 555 occurrences");
assert(master.sourceSeedSha256 === createHash("sha256").update(seedBytes).digest("hex"), "Master evidence must bind to the exact seed bytes");
assert(master.companies.length === 465 && master.summary.canonicalTotal === 465, "Master evidence must contain all 465 canonical companies");
assert(master.collectionResults.length === 465 && master.summary.completed === 465 && master.summary.remaining === 0,
  "Shared evidence collection must be complete before scoring");
assert(new Set(master.companies.map((company) => company.dossierId)).size === 465, "Dossier IDs must be unique");
assert(master.collectionResults.every((result) => result.officialPagesAttempted <= 5
  && result.officialPagesCollected <= result.officialPagesAttempted && result.fallbackSourcesCollected <= 2),
"No company may exceed the frozen 5+2 shared evidence budget");
assert(master.companies.flatMap(providerNeutralScoringEvidence).every((item) => item.sourceType !== "discovery-summary"),
  "Discovery-only material must not enter the scoring view");
assert(master.companies.flatMap(providerNeutralScoringEvidence).every((item) =>
  !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item.excerpt)
  && !/(?:\+?\d[\d\s()./-]{7,}\d)/.test(item.excerpt)), "Scoring evidence contains an unredacted contact");
assert(scores.summary.canonicalCompanies === 465, "Scoring must cover every canonical company");
assert(scores.scores.length === scores.summary.uniqueSystemLaneCompanyOccurrences, "Score row summary is inconsistent");
assert(scores.scores.length + scores.summary.duplicateCanonicalOccurrencesSuppressed === 555,
  "Every submitted occurrence must be scored or explicitly suppressed as a canonical duplicate");
assert(scores.summary.eligibleOccurrences + scores.summary.rejectedOccurrences === scores.scores.length,
  "Eligibility summary is inconsistent");
assert(new Set(scores.scores.map((item) => `${item.systemId}\u0000${item.channelId}\u0000${item.dossierId}`)).size === scores.scores.length,
  "A canonical company may occur at most once per system and lane");
assert(scores.scores.every((item) => item.score >= 0 && item.score <= 100
  && (item.failedGates.length === 0 || item.score === 0)), "Scores must respect the eligibility gates and 0-100 scale");
assert(blindPacket.runId === runId && blindPacket.candidates.length === 12, "Blind packet must contain the frozen 12 cases");
assert(new Set(blindPacket.candidates.map((item) => item.blindCandidateId)).size === 12, "Blind case IDs must be unique");
for (const lane of ["tier1-distribution", "b2b-resale", "project-services"]) {
  assert(blindPacket.candidates.filter((item) => item.reviewLane === lane).length === 4, `Blind packet must contain four ${lane} cases`);
}
assert(blindPacket.candidates.flatMap((item) => item.evidenceItems).every((item) => item.sourceType !== "discovery-summary"),
  "Blind packet must use provider-neutral evidence only");
assertBlind(blindPacket);

console.log(JSON.stringify({
  runId,
  canonicalCompanies: master.companies.length,
  submittedOccurrences: seed.submittedOccurrenceCount,
  uniqueScoredOccurrences: scores.scores.length,
  eligibleOccurrences: scores.summary.eligibleOccurrences,
  providerNeutralEvidenceItems: master.companies.flatMap(providerNeutralScoringEvidence).length,
  blindAuditCases: blindPacket.candidates.length,
}, null, 2));
