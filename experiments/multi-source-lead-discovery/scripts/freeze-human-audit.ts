import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ChannelId = "tier1-distribution" | "b2b-resale" | "project-services";
type HumanCategory = ChannelId | "none-or-unclear";
type SampleType = "core" | "problem";

interface BenchmarkConfig {
  protocolVersion: string;
  execution: { runId: string };
  scoring: { blindAudit: { auditVersion: string } };
}

interface AuditPacket {
  runId: string;
  candidates: Array<{
    blindCandidateId: string;
    sampleType: SampleType;
    companyName: string;
    officialUrl: string | null;
  }>;
}

interface HumanDecision {
  blindCandidateId: string;
  gates: {
    companyExists: boolean | null;
    germanyPresence: boolean | null;
    networkingRelevant: boolean | null;
    sufficientEvidence: boolean | null;
  };
  validCategory: HumanCategory | null;
  levels: {
    productUseCaseFit: number | null;
    cooperationPath: number | null;
    evidenceReliability: number | null;
  };
  reviewerNotes: string;
}

interface LocalDecisions {
  schemaVersion: number;
  runId: string;
  decisions: HumanDecision[];
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const benchmark = await readJson<BenchmarkConfig>(path.join(root, "config/benchmark.json"));
const runId = benchmark.execution.runId;
const artifactRoot = path.join(root, "artifacts/runs", runId);
const packet = await readJson<AuditPacket>(path.join(artifactRoot, "scoring/blind-audit-packet.json"));
const local = await readJson<LocalDecisions>(path.join(root, "runs/raw", runId, "audit/human-audit-decisions.local.template.json"));

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertBlind(value: unknown, location = "decisions"): void {
  const forbidden = new Set(["systemId", "provider", "providerId", "geminiMode", "rank", "modelScore", "occurrenceCount"]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertBlind(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Human decision checkpoint leaked hidden field ${location}.${key}`);
    assertBlind(child, `${location}.${key}`);
  }
}

if (packet.runId !== runId || local.runId !== runId) throw new Error("Human audit inputs do not match the configured run");
if (packet.candidates.length !== 12 || local.decisions.length !== packet.candidates.length) {
  throw new Error(`Expected 12 packet candidates and decisions, found ${packet.candidates.length} and ${local.decisions.length}`);
}
const packetIds = packet.candidates.map((candidate) => candidate.blindCandidateId);
const decisionIds = local.decisions.map((decision) => decision.blindCandidateId);
if (new Set(packetIds).size !== packetIds.length || new Set(decisionIds).size !== decisionIds.length
  || packetIds.some((id, index) => decisionIds[index] !== id)) {
  throw new Error("Human decisions must match the packet IDs and order exactly");
}

const validCategories = new Set<HumanCategory>(["tier1-distribution", "b2b-resale", "project-services", "none-or-unclear"]);
const frozenDecisions = local.decisions.map((decision, index) => {
  const gateValues = Object.values(decision.gates);
  if (gateValues.some((value) => typeof value !== "boolean")) throw new Error(`Incomplete gates for ${decision.blindCandidateId}`);
  if (!decision.validCategory || !validCategories.has(decision.validCategory)) {
    throw new Error(`Invalid category for ${decision.blindCandidateId}`);
  }
  const levelValues = Object.values(decision.levels);
  if (levelValues.some((value) => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 5)) {
    throw new Error(`Invalid score levels for ${decision.blindCandidateId}`);
  }
  const allGatesPass = gateValues.every(Boolean);
  if (allGatesPass === (decision.validCategory === "none-or-unclear")) {
    throw new Error(`Gate/category mismatch for ${decision.blindCandidateId}`);
  }
  if (!decision.reviewerNotes.trim()) throw new Error(`Missing reviewer notes for ${decision.blindCandidateId}`);
  const candidate = packet.candidates[index];
  return {
    blindCandidateId: decision.blindCandidateId,
    sampleType: candidate.sampleType,
    companyName: candidate.companyName,
    officialUrl: candidate.officialUrl,
    gates: decision.gates as Record<string, boolean>,
    validCategory: decision.validCategory,
    levels: decision.levels as Record<string, number>,
    reviewerNotes: decision.reviewerNotes.trim(),
  };
});

const checkpoint = {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  auditVersion: benchmark.scoring.blindAudit.auditVersion,
  runId,
  status: "human-blind-decisions-frozen-before-deblinding",
  reviewer: "user",
  decisionCount: frozenDecisions.length,
  coreDecisionCount: frozenDecisions.filter((decision) => decision.sampleType === "core").length,
  problemDecisionCount: frozenDecisions.filter((decision) => decision.sampleType === "problem").length,
  supplementalOfficialSiteChecksOccurred: true,
  supplementalEvidencePolicy: "Reviewer-observed official-site facts are preserved in notes and reported as supplemental evidence; current Cudy relationship itself remains zero-weight.",
  hiddenDuringDecision: ["system", "provider", "geminiMode", "rank", "modelScore", "occurrenceCount", "cudyRelationship"],
  decisions: frozenDecisions,
};
assertBlind(checkpoint);
const serializedCheckpoint = `${JSON.stringify(checkpoint, null, 2)}\n`;
const output = path.join(artifactRoot, "scoring/human-audit-decisions.blind.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, serializedCheckpoint, "utf8");

console.log(JSON.stringify({
  output: path.relative(path.resolve("."), output).replaceAll("\\", "/"),
  decisionCount: frozenDecisions.length,
  coreDecisionCount: checkpoint.coreDecisionCount,
  problemDecisionCount: checkpoint.problemDecisionCount,
  decisionSetSha256: digest(serializedCheckpoint),
}, null, 2));
