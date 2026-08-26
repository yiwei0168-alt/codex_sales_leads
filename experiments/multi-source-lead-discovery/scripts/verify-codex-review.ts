import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface ManifestEntry {
  blindBatchId: string;
  reviewMode: "discovery-pool" | "fixed-output";
  channelId: string;
  evidenceEntryCount: number;
  packetSha256: string;
}

interface Manifest {
  protocolVersion: string;
  runId: string;
  batchCount: number;
  packets: ManifestEntry[];
}

interface Packet {
  protocolVersion: string;
  blindBatchId: string;
  reviewMode: ManifestEntry["reviewMode"];
  channel: { id: string };
  evidenceEntries: Array<{ evidenceEntryId: string }>;
}

interface SelectedCandidate {
  companyName: string;
  eligibility: Record<string, unknown>;
  levels: Record<string, unknown>;
  sourceEvidenceIds: string[];
}

interface Decision {
  protocolVersion: string;
  blindBatchId: string;
  reviewMode: ManifestEntry["reviewMode"];
  channelId: string;
  reviewer: string;
  externalSearchUsed: boolean;
  selectedCandidates: SelectedCandidate[];
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const runIdArgument = process.argv.find((argument) => argument.startsWith("--run-id="))?.split("=", 2)[1];
const requireComplete = process.argv.includes("--require-complete");
const fallbackManifest = path.join(root, "artifacts/runs/2026-08-26-de-v1/codex-review/manifest.json");
const initialManifest = await readJson<Manifest>(runIdArgument
  ? path.join(root, "artifacts/runs", runIdArgument, "codex-review/manifest.json")
  : fallbackManifest);
const reviewRoot = path.join(root, "artifacts/runs", initialManifest.runId, "codex-review");
const decisionsRoot = path.join(reviewRoot, "decisions");
const errors: string[] = [];
const verified: string[] = [];
const expectedDecisionFiles = new Set(initialManifest.packets.map((entry) => `${entry.blindBatchId}.json`));

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

function fail(batchId: string, message: string): void {
  errors.push(`${batchId}: ${message}`);
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function score(candidate: SelectedCandidate): number {
  const gatesPass = Object.values(candidate.eligibility).every((value) => value === true);
  if (!gatesPass) return 0;
  return Number(candidate.levels.productUseCaseFit) * 9
    + Number(candidate.levels.cooperationPath) * 7
    + Number(candidate.levels.evidenceReliability) * 4;
}

function findForbiddenKey(value: unknown, location = "decision"): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${location}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (["systemId", "providerId", "apiScore", "providerRank"].includes(key)) return `${location}.${key}`;
    const found = findForbiddenKey(child, `${location}.${key}`);
    if (found) return found;
  }
  return undefined;
}

let decisionFiles: string[] = [];
try {
  decisionFiles = (await readdir(decisionsRoot)).filter((filename) => filename.endsWith(".json")).sort();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

for (const filename of decisionFiles) {
  if (!expectedDecisionFiles.has(filename)) errors.push(`${filename}: decision has no matching manifest batch`);
}

for (const entry of initialManifest.packets) {
  const batchId = entry.blindBatchId;
  const packetPath = path.join(reviewRoot, "packets", `${batchId}.json`);
  const packetContent = await readFile(packetPath, "utf8");
  const packetDigest = createHash("sha256").update(packetContent).digest("hex");
  if (packetDigest !== entry.packetSha256) fail(batchId, "packet SHA-256 does not match frozen manifest");
  const packet = JSON.parse(packetContent) as Packet;
  if (packet.protocolVersion !== initialManifest.protocolVersion) fail(batchId, "packet protocol version mismatch");
  if (packet.blindBatchId !== batchId) fail(batchId, "packet batch ID mismatch");
  if (packet.reviewMode !== entry.reviewMode) fail(batchId, "packet review mode mismatch");
  if (packet.channel.id !== entry.channelId) fail(batchId, "packet channel mismatch");
  if (packet.evidenceEntries.length !== entry.evidenceEntryCount) fail(batchId, "packet evidence count mismatch");

  const decisionFilename = path.join(decisionsRoot, `${batchId}.json`);
  let decision: Decision;
  try {
    decision = await readJson<Decision>(decisionFilename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (requireComplete) fail(batchId, "decision is missing");
      continue;
    }
    fail(batchId, `decision cannot be parsed: ${(error as Error).message}`);
    continue;
  }

  if (decision.protocolVersion !== initialManifest.protocolVersion) fail(batchId, "decision protocol version mismatch");
  if (decision.blindBatchId !== batchId) fail(batchId, "decision batch ID mismatch");
  if (decision.reviewMode !== entry.reviewMode) fail(batchId, "decision review mode mismatch");
  if (decision.channelId !== entry.channelId) fail(batchId, "decision channel mismatch");
  if (decision.reviewer !== "runtime-managed-codex") fail(batchId, "unexpected reviewer");
  if (decision.externalSearchUsed !== false) fail(batchId, "externalSearchUsed must be false");
  const forbiddenKey = findForbiddenKey(decision);
  if (forbiddenKey) fail(batchId, `forbidden identity or API-score field at ${forbiddenKey}`);

  const evidenceIds = new Set(packet.evidenceEntries.map((item) => item.evidenceEntryId));
  const names = new Set<string>();
  const requiredGates = ["companyExists", "germanyPresence", "networkingRelevant", "submittedChannelRole", "sufficientEvidence", "uniqueWithinList"];
  const levelNames = ["productUseCaseFit", "cooperationPath", "evidenceReliability"];
  for (const [index, candidate] of decision.selectedCandidates.entries()) {
    const label = `selectedCandidates[${index}]`;
    if (!candidate.companyName?.trim()) fail(batchId, `${label} has no companyName`);
    const normalizedName = normalizeName(candidate.companyName ?? "");
    if (names.has(normalizedName)) fail(batchId, `${label} duplicates another company name`);
    names.add(normalizedName);
    for (const gate of requiredGates) {
      if (typeof candidate.eligibility?.[gate] !== "boolean") fail(batchId, `${label}.${gate} is not boolean`);
    }
    for (const levelName of levelNames) {
      const value = candidate.levels?.[levelName];
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 5) {
        fail(batchId, `${label}.${levelName} must be an integer from 0 to 5`);
      }
    }
    if (!Array.isArray(candidate.sourceEvidenceIds) || candidate.sourceEvidenceIds.length === 0) {
      fail(batchId, `${label} has no source evidence ID`);
    } else {
      for (const sourceId of candidate.sourceEvidenceIds) {
        if (!evidenceIds.has(sourceId)) fail(batchId, `${label} cites unknown evidence ID ${sourceId}`);
      }
    }
  }

  if (entry.reviewMode === "fixed-output") {
    if (decision.selectedCandidates.length !== packet.evidenceEntries.length) fail(batchId, "fixed-output decision must preserve every submitted candidate");
    const actualOrder = decision.selectedCandidates.map((candidate) => candidate.sourceEvidenceIds[0]);
    const expectedOrder = packet.evidenceEntries.map((item) => item.evidenceEntryId);
    if (actualOrder.join("|") !== expectedOrder.join("|")) fail(batchId, "fixed-output evidence IDs or order changed");
  } else {
    if (decision.selectedCandidates.length > 10) fail(batchId, "discovery-pool selected more than ten companies");
    for (let index = 1; index < decision.selectedCandidates.length; index += 1) {
      if (score(decision.selectedCandidates[index - 1]) < score(decision.selectedCandidates[index])) {
        fail(batchId, "discovery-pool candidates are not ranked by non-increasing score");
        break;
      }
    }
  }
  verified.push(batchId);
}

if (initialManifest.batchCount !== initialManifest.packets.length) errors.push("manifest batchCount does not match packet entries");
console.log(JSON.stringify({
  runId: initialManifest.runId,
  requireComplete,
  verifiedDecisionCount: verified.length,
  expectedDecisionCount: initialManifest.batchCount,
  errors,
}, null, 2));
if (errors.length > 0) process.exitCode = 1;
