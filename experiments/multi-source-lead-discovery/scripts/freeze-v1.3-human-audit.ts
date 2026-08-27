import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Lane = "tier1-distribution" | "b2b-resale" | "project-services";
type SupportedCategory = Lane | "none-or-unclear";

interface AuditPacket {
  runId: string;
  candidates: Array<{ blindCandidateId: string; companyName: string; officialUrl: string | null; reviewLane: Lane }>;
}

interface Decision {
  blindCandidateId: string;
  gates: Record<"companyExists" | "germanyPresence" | "activeNetworking" | "sufficientEvidence", boolean | null>;
  supportedCategories: SupportedCategory[];
  submittedLanePass: boolean | null;
  levels: Record<"productUseCaseFit" | "cooperationPath" | "evidenceReliability", number | null>;
  reviewerNotes: string;
}

interface LocalDecisions { schemaVersion: number; runId: string; decisions: Decision[] }

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery");
const artifactRoot = path.join(root, "artifacts/runs", runId);
const packet = JSON.parse(await readFile(path.join(artifactRoot, "scoring/blind-audit-packet.json"), "utf8")) as AuditPacket;
const local = JSON.parse(await readFile(path.join(root, "runs/raw", runId, "audit/human-audit-decisions.local.template.json"), "utf8")) as LocalDecisions;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertBlind(value: unknown, location = "checkpoint"): void {
  const forbidden = new Set(["systemId", "provider", "providerId", "rank", "submittedRank", "score", "modelScore", "occurrenceCount", "sampleType"]);
  if (Array.isArray(value)) return value.forEach((item, index) => assertBlind(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert(!forbidden.has(key), `Blind checkpoint leaked ${location}.${key}`);
    assertBlind(child, `${location}.${key}`);
  }
}

assert(packet.runId === runId && local.runId === runId, "Audit inputs must use the target run ID");
assert(packet.candidates.length === 12 && local.decisions.length === 12, "Expected exactly 12 packet cases and decisions");
const allowedCategories = new Set<SupportedCategory>(["tier1-distribution", "b2b-resale", "project-services", "none-or-unclear"]);
const frozen = packet.candidates.map((candidate, index) => {
  const decision = local.decisions[index];
  assert(decision?.blindCandidateId === candidate.blindCandidateId, "Decision order and blind IDs must match the packet");
  assert(Object.values(decision.gates).every((value) => typeof value === "boolean"), `Incomplete gates for ${candidate.blindCandidateId}`);
  assert(typeof decision.submittedLanePass === "boolean", `Incomplete submitted-lane decision for ${candidate.blindCandidateId}`);
  assert(decision.supportedCategories.length > 0 && decision.supportedCategories.every((value) => allowedCategories.has(value)),
    `Invalid supported categories for ${candidate.blindCandidateId}`);
  assert(Object.values(decision.levels).every((value) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5),
    `Invalid numeric levels for ${candidate.blindCandidateId}`);
  assert(decision.reviewerNotes.trim().length > 0, `Missing notes for ${candidate.blindCandidateId}`);
  assert(!decision.submittedLanePass || decision.supportedCategories.includes(candidate.reviewLane),
    `A passing submitted lane must be included in supported categories for ${candidate.blindCandidateId}`);
  return {
    blindCandidateId: candidate.blindCandidateId,
    companyName: candidate.companyName,
    officialUrl: candidate.officialUrl,
    reviewLane: candidate.reviewLane,
    gates: decision.gates as Record<string, boolean>,
    supportedCategories: decision.supportedCategories,
    submittedLanePass: decision.submittedLanePass,
    levels: decision.levels as Record<string, number>,
    reviewerNotes: decision.reviewerNotes.trim(),
  };
});

const checkpoint = {
  schemaVersion: 1,
  runId,
  auditVersion: "v1.3-small-sample-human-calibration-12",
  status: "human-blind-decisions-frozen-before-deblinding",
  reviewer: "user",
  decisionCount: frozen.length,
  hiddenDuringDecision: ["system/provider", "discovery rank", "rule score", "occurrence count", "core/problem stratum"],
  decisions: frozen,
};
assertBlind(checkpoint);
const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
const output = path.join(artifactRoot, "scoring/human-audit-decisions.blind.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, serialized, "utf8");
console.log(JSON.stringify({
  output: path.relative(process.cwd(), output),
  decisionCount: frozen.length,
  decisionSetSha256: createHash("sha256").update(serialized).digest("hex"),
}, null, 2));
