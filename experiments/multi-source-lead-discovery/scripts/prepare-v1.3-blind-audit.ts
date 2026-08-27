import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { providerNeutralScoringEvidence, type BenchmarkLane, type SharedEvidenceDossier } from "../lib/evidence-dossier";
import type { V13OccurrenceScore } from "../lib/v1.3-rescoring";

type ScoreRow = Omit<V13OccurrenceScore, "evidence">;
interface MasterArtifact { runId: string; companies: SharedEvidenceDossier[] }
interface ScoreArtifact { runId: string; scores: ScoreRow[] }

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery");
const artifactRoot = path.join(root, "artifacts/runs", runId);
const rawAuditRoot = path.join(root, "runs/raw", runId, "audit");
const master = JSON.parse(await readFile(path.join(artifactRoot, "evidence/shared-evidence-dossiers.v1.json"), "utf8")) as MasterArtifact;
const scoring = JSON.parse(await readFile(path.join(artifactRoot, "scoring/all-candidate-scores.json"), "utf8")) as ScoreArtifact;
const dossierById = new Map(master.companies.map((company) => [company.dossierId, company]));
const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];
const localSystem = "product-google-places-local";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function order(value: string): string {
  return digest(`v1.3-human-calibration-12:${value}`);
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertNoHiddenFields(value: unknown, location = "packet"): void {
  const forbidden = new Set(["systemId", "provider", "providerId", "rank", "submittedRank", "score", "modelScore", "occurrenceCount", "sampleType"]);
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoHiddenFields(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Blind packet leaked ${location}.${key}`);
    assertNoHiddenFields(child, `${location}.${key}`);
  }
}

await mkdir(rawAuditRoot, { recursive: true });
const saltPath = path.join(rawAuditRoot, ".blind-salt");
let salt: string;
try {
  salt = (await readFile(saltPath, "utf8")).trim();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  salt = randomBytes(32).toString("hex");
  await writeFile(saltPath, salt, "utf8");
}

const selectedDossiers = new Set<string>();
const selected: Array<{ row: ScoreRow; sampleType: "core" | "problem"; selectionReason: string }> = [];

function choose(rows: ScoreRow[], sampleType: "core" | "problem", reason: string): boolean {
  const row = rows.filter((item) => !selectedDossiers.has(item.dossierId))
    .sort((left, right) => right.score - left.score || left.failedGates.length - right.failedGates.length
      || order(`${left.dossierId}:${left.systemId}:${left.channelId}`).localeCompare(order(`${right.dossierId}:${right.systemId}:${right.channelId}`)))[0];
  if (!row) return false;
  selectedDossiers.add(row.dossierId);
  selected.push({ row, sampleType, selectionReason: reason });
  return true;
}

for (const lane of lanes) {
  const eligible = scoring.scores.filter((row) => row.channelId === lane && row.failedGates.length === 0);
  choose(eligible.filter((row) => row.systemId === localSystem), "core", "highest eligible Google Places Local case in lane");
  choose(eligible.filter((row) => row.systemId !== localSystem), "core", "highest eligible non-control case in lane");
  while (selected.filter((item) => item.sampleType === "core" && item.row.channelId === lane).length < 2) {
    if (!choose(eligible, "core", "eligible lane fill")) throw new Error(`Not enough core cases for ${lane}`);
  }
}

for (const lane of lanes) {
  const problemPool = scoring.scores.filter((row) => row.channelId === lane && (
    (row.failedGates.length >= 1 && row.failedGates.length <= 3)
    || (row.failedGates.length === 0 && row.score <= 65)
  ));
  choose(problemPool.filter((row) => row.systemId === localSystem && Boolean(dossierById.get(row.dossierId)?.canonicalOfficialUrl)),
    "problem", "Google Places Local near-miss or low-confidence case");
  choose(problemPool.filter((row) => row.systemId !== localSystem), "problem", "cross-system near-miss or low-confidence case");
  while (selected.filter((item) => item.sampleType === "problem" && item.row.channelId === lane).length < 2) {
    if (!choose(problemPool, "problem", "problem lane fill")) throw new Error(`Not enough problem cases for ${lane}`);
  }
}

if (selected.length !== 12 || selected.filter((item) => item.sampleType === "core").length !== 6) {
  throw new Error(`Expected 6 core plus 6 problem cases, selected ${selected.length}`);
}

const identities = selected.map((item) => {
  const dossier = dossierById.get(item.row.dossierId);
  if (!dossier) throw new Error(`Missing dossier ${item.row.dossierId}`);
  return {
    blindCandidateId: `V13-${digest(`${salt}:${item.row.dossierId}:${item.row.channelId}`).slice(0, 10).toUpperCase()}`,
    ...item,
    evidence: providerNeutralScoringEvidence(dossier),
  };
}).sort((left, right) => order(left.blindCandidateId).localeCompare(order(right.blindCandidateId)));

const packet = {
  schemaVersion: 1,
  runId,
  instructions: "System/provider, discovery rank, rule score and core/problem stratum are hidden. Judge only the supplied public evidence. Multiple supported roles/categories are allowed and no primary role is required.",
  candidates: identities.map((item) => ({
    blindCandidateId: item.blindCandidateId,
    reviewLane: item.row.channelId,
    companyName: item.row.companyName,
    officialUrl: item.row.officialUrl,
    evidenceItems: item.evidence.map((evidence) => ({
      url: evidence.url,
      excerpt: evidence.excerpt,
      sourceType: evidence.sourceType,
    })),
    reviewerTask: {
      determineGates: ["companyExists", "germanyPresence", "activeNetworking", "sufficientEvidence"],
      chooseAllSupportedCategories: ["tier1-distribution", "b2b-resale", "project-services", "none-or-unclear"],
      submittedLanePass: "yes/no for reviewLane; any proven eligible role in that lane passes",
      assignIntegerLevels: { productUseCaseFit: "0-5", cooperationPathForReviewLane: "0-5", evidenceReliability: "0-5" },
      reviewerNotes: "Explain any correction to a gate, role/category or numeric level.",
    },
  })),
};
assertNoHiddenFields(packet);

await writeJson(path.join(rawAuditRoot, "blind-identity-map.local.json"), {
  schemaVersion: 1,
  runId,
  identities: identities.map(({ evidence: _evidence, ...identity }) => identity),
});
await writeJson(path.join(rawAuditRoot, "human-audit-decisions.local.template.json"), {
  schemaVersion: 1,
  runId,
  decisions: packet.candidates.map((candidate) => ({
    blindCandidateId: candidate.blindCandidateId,
    gates: { companyExists: null, germanyPresence: null, activeNetworking: null, sufficientEvidence: null },
    supportedCategories: [],
    submittedLanePass: null,
    levels: { productUseCaseFit: null, cooperationPath: null, evidenceReliability: null },
    reviewerNotes: "",
  })),
});
await writeJson(path.join(artifactRoot, "scoring/blind-audit-packet.json"), packet);
await writeJson(path.join(artifactRoot, "scoring/blind-audit-manifest.json"), {
  schemaVersion: 1,
  runId,
  auditVersion: "v1.3-small-sample-human-calibration-12",
  providerIdentityHidden: true,
  hiddenFields: ["system/provider", "discovery rank", "rule score", "occurrence count", "core/problem stratum"],
  coreSampleSize: 6,
  problemSampleSize: 6,
  totalSampleSize: 12,
  samplesPerLane: Object.fromEntries(lanes.map((lane) => [lane, identities.filter((item) => item.row.channelId === lane).length])),
  identityMapCommitted: false,
  reviewerDecisionStatus: "pending",
  calibrationBoundary: "Human decisions are reference calibration; any numeric correction must be one uniform category-level offset applied to every system, capped at +/-8 points.",
});

console.log(JSON.stringify({
  runId,
  totalSample: identities.length,
  samplesPerLane: Object.fromEntries(lanes.map((lane) => [lane, identities.filter((item) => item.row.channelId === lane).length])),
  packet: path.relative(process.cwd(), path.join(artifactRoot, "scoring/blind-audit-packet.json")),
  localDecisionTemplate: path.relative(process.cwd(), path.join(rawAuditRoot, "human-audit-decisions.local.template.json")),
}, null, 2));
