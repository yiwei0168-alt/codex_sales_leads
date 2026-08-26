import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { candidateScore, canonicalPublicUrl, sanitizeText, type EligibilityGates, type ScoreLevels } from "../lib/evaluation";

type ReviewMode = "discovery-pool" | "fixed-output";

interface BenchmarkConfig {
  protocolVersion: string;
  execution: { runId: string; runOrder: string[] };
  scoring: { finalSlotsPerChannel: number };
}

interface InputsConfig {
  channels: Array<{ id: string; label: string }>;
}

interface Identity {
  blindBatchId: string;
  systemId: string;
  channelId: string;
  reviewMode: ReviewMode;
  sourcePath: string;
}

interface IdentityMap {
  protocolVersion: string;
  runId: string;
  identities: Identity[];
}

interface PacketEvidence {
  evidenceEntryId: string;
  title?: string;
  url?: string | null;
  snippet?: string;
  submittedCandidate?: {
    companyName?: string;
    officialUrl?: string;
    reason?: string;
    evidenceUrls?: string[];
  };
}

interface Packet {
  protocolVersion: string;
  blindBatchId: string;
  reviewMode: ReviewMode;
  channel: { id: string };
  evidenceEntries: PacketEvidence[];
}

interface DecisionCandidate {
  companyName: string;
  officialUrl?: string | null;
  roles: string[];
  eligibility: EligibilityGates;
  levels: ScoreLevels;
  sourceEvidenceIds: string[];
  roleEvidence: string;
  productFitEvidence: string;
  cooperationEvidence: string;
  rationale: string;
}

interface Decision {
  protocolVersion: string;
  blindBatchId: string;
  reviewMode: ReviewMode;
  channelId: string;
  reviewer: string;
  externalSearchUsed: boolean;
  selectedCandidates: DecisionCandidate[];
  rejectedItems: Array<{ title: string; url: string | null; reason: string }>;
}

interface EvidenceItem {
  evidenceEntryId: string;
  url: string;
  excerpt: string;
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const [benchmark, inputs] = await Promise.all([
  readJson<BenchmarkConfig>(path.join(root, "config/benchmark.json")),
  readJson<InputsConfig>(path.join(root, "config/inputs.json")),
]);
const runId = benchmark.execution.runId;
const artifactRoot = path.join(root, "artifacts/runs", runId);
const reviewRoot = path.join(artifactRoot, "codex-review");
const identityPath = path.join(root, "runs/raw", runId, "codex-review/blind-identity-map.local.json");
const identityContent = await readFile(identityPath, "utf8");
const identityMap = JSON.parse(identityContent) as IdentityMap;

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

async function writeJson(filename: string, value: unknown): Promise<string> {
  await mkdir(path.dirname(filename), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filename, content, "utf8");
  return digest(content);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function gatesPass(gates: EligibilityGates): boolean {
  return Object.values(gates).every((value) => value === true);
}

function evidenceItems(candidate: DecisionCandidate, evidenceById: Map<string, PacketEvidence>): EvidenceItem[] {
  return candidate.sourceEvidenceIds.flatMap((evidenceEntryId) => {
    const entry = evidenceById.get(evidenceEntryId);
    if (!entry) throw new Error(`${evidenceEntryId} is missing from frozen packet`);
    if (entry.submittedCandidate) {
      const url = canonicalPublicUrl(entry.submittedCandidate.officialUrl)
        ?? (entry.submittedCandidate.evidenceUrls ?? []).map(canonicalPublicUrl).find(Boolean)
        ?? canonicalPublicUrl(candidate.officialUrl);
      const excerpt = sanitizeText(entry.submittedCandidate.reason ?? "");
      return url && excerpt ? [{ evidenceEntryId, url, excerpt }] : [];
    }
    const url = canonicalPublicUrl(entry.url);
    const excerpt = sanitizeText(entry.snippet ?? "");
    return url && excerpt ? [{ evidenceEntryId, url, excerpt }] : [];
  });
}

if (identityMap.protocolVersion !== benchmark.protocolVersion || identityMap.runId !== runId) {
  throw new Error("Blind identity map does not match the frozen benchmark");
}
const expectedPairs = benchmark.execution.runOrder.flatMap((systemId) =>
  inputs.channels.map((channel) => `${systemId}:${channel.id}`));
if (identityMap.identities.length !== expectedPairs.length
  || new Set(identityMap.identities.map((identity) => `${identity.systemId}:${identity.channelId}`)).size !== expectedPairs.length) {
  throw new Error("Blind identity map is incomplete or contains duplicate system/channel pairs");
}

const systemRows = new Map<string, Array<Record<string, unknown>>>();
const mappings: Array<Record<string, unknown>> = [];
const decisionDigests: string[] = [];
for (const identity of identityMap.identities) {
  const decisionPath = path.join(reviewRoot, "decisions", `${identity.blindBatchId}.json`);
  const packetPath = path.join(reviewRoot, "packets", `${identity.blindBatchId}.json`);
  const [decisionContent, packet] = await Promise.all([
    readFile(decisionPath, "utf8"),
    readJson<Packet>(packetPath),
  ]);
  const decision = JSON.parse(decisionContent) as Decision;
  if (decision.protocolVersion !== benchmark.protocolVersion || decision.blindBatchId !== identity.blindBatchId
    || decision.channelId !== identity.channelId || decision.reviewMode !== identity.reviewMode
    || decision.reviewer !== "runtime-managed-codex" || decision.externalSearchUsed !== false) {
    throw new Error(`Frozen decision does not match deblind identity: ${identity.blindBatchId}`);
  }
  if (packet.protocolVersion !== benchmark.protocolVersion || packet.blindBatchId !== identity.blindBatchId
    || packet.channel.id !== identity.channelId || packet.reviewMode !== identity.reviewMode) {
    throw new Error(`Frozen packet does not match deblind identity: ${identity.blindBatchId}`);
  }
  const evidenceById = new Map(packet.evidenceEntries.map((entry) => [entry.evidenceEntryId, entry]));
  const selectedCandidates = decision.selectedCandidates.map((candidate, index) => {
    const score = gatesPass(candidate.eligibility) ? candidateScore(candidate.levels) : 0;
    return {
      rank: index + 1,
      companyName: candidate.companyName,
      officialUrl: canonicalPublicUrl(candidate.officialUrl),
      roles: candidate.roles,
      eligibility: candidate.eligibility,
      levels: candidate.levels,
      score,
      roleEvidence: candidate.roleEvidence,
      productFitEvidence: candidate.productFitEvidence,
      cooperationEvidence: candidate.cooperationEvidence,
      evidenceItems: evidenceItems(candidate, evidenceById),
      rationale: candidate.rationale,
    };
  });
  const slots = Array.from({ length: benchmark.scoring.finalSlotsPerChannel }, (_, index) => selectedCandidates[index]?.score ?? 0);
  const selectedLevels = (dimension: keyof ScoreLevels) => Array.from(
    { length: benchmark.scoring.finalSlotsPerChannel },
    (_, index) => selectedCandidates[index] && gatesPass(selectedCandidates[index].eligibility)
      ? selectedCandidates[index].levels[dimension] : 0,
  );
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const artifact = {
    schemaVersion: 1,
    protocolVersion: benchmark.protocolVersion,
    runId,
    systemId: identity.systemId,
    channelId: identity.channelId,
    reviewMode: identity.reviewMode,
    blindBatchId: identity.blindBatchId,
    sourceDiscoveryArtifact: identity.sourcePath,
    selectedCandidates,
    rejectedItems: decision.rejectedItems,
    scoring: {
      finalSlots: benchmark.scoring.finalSlotsPerChannel,
      filledSlots: selectedCandidates.length,
      missingSlots: benchmark.scoring.finalSlotsPerChannel - selectedCandidates.length,
      slotScores: slots,
      channelScore: mean(slots),
      meanLevelsAcrossTenSlots: {
        productUseCaseFit: mean(selectedLevels("productUseCaseFit")),
        cooperationPath: mean(selectedLevels("cooperationPath")),
        evidenceReliability: mean(selectedLevels("evidenceReliability")),
      },
    },
    evaluator: {
      provider: "codex-agent",
      transport: "in-session-no-api",
      model: "runtime-managed-codex",
      systemIdentityHiddenDuringReview: true,
      providerIdentityHiddenDuringReview: true,
      apiScoresHiddenDuringReview: true,
      externalSearchUsed: false,
    },
  };
  const relativePath = `primary-evaluation/${identity.systemId}/${identity.channelId}.json`;
  const artifactSha256 = await writeJson(path.join(artifactRoot, relativePath), artifact);
  const channelRow = {
    channelId: identity.channelId,
    blindBatchId: identity.blindBatchId,
    reviewMode: identity.reviewMode,
    filledSlots: selectedCandidates.length,
    missingSlots: benchmark.scoring.finalSlotsPerChannel - selectedCandidates.length,
    channelScore: mean(slots),
    slotScores: slots,
    meanLevelsAcrossTenSlots: artifact.scoring.meanLevelsAcrossTenSlots,
    artifact: relativePath,
    artifactSha256,
  };
  systemRows.set(identity.systemId, [...(systemRows.get(identity.systemId) ?? []), channelRow]);
  const decisionSha256 = digest(decisionContent);
  decisionDigests.push(`${identity.blindBatchId}:${decisionSha256}`);
  mappings.push({ ...identity, decisionSha256, primaryEvaluationArtifact: relativePath, primaryEvaluationSha256: artifactSha256 });
}

const systems = benchmark.execution.runOrder.map((systemId) => {
  const channelMap = new Map((systemRows.get(systemId) ?? []).map((row) => [String(row.channelId), row]));
  const channels = inputs.channels.map((channel) => {
    const row = channelMap.get(channel.id);
    if (!row) throw new Error(`Missing aggregate row for ${systemId}/${channel.id}`);
    return row;
  });
  const overallScore = channels.reduce((sum, row) => sum + Number(row.channelScore), 0) / channels.length;
  return { systemId, overallScore, channels };
});
const leaderboard = [...systems].sort((left, right) => right.overallScore - left.overallScore)
  .map((system, index) => ({ rank: index + 1, ...system }));

await writeJson(path.join(artifactRoot, "scoring/raw-system-scores.json"), {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  runId,
  status: "primary-codex-scores-before-human-audit",
  formula: "candidateScore=fit*9+path*7+evidence*4; channelScore=sum(ten slots)/10; overallScore=equal macro mean of three channels",
  judge: "runtime-managed-codex",
  apiJudgeResultsIncluded: false,
  systems,
});
await writeJson(path.join(artifactRoot, "scoring/leaderboard-pre-human-audit.json"), {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  runId,
  status: "provisional-pending-human-blind-audit",
  rankingMetric: "equal-weight macro mean of tier1-distribution, b2b-resale and project-services",
  leaderboard,
});
await writeJson(path.join(reviewRoot, "deblind-manifest.json"), {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  runId,
  blindDecisionCheckpointCommit: "cc4052c",
  identityMapCommitted: false,
  identityMapSha256: digest(identityContent),
  decisionSetSha256: digest([...decisionDigests].sort().join("\n")),
  batchCount: mappings.length,
  mappings,
});

console.log(JSON.stringify({
  runId,
  batchCount: mappings.length,
  leaderboard: leaderboard.map((row) => ({ rank: row.rank, systemId: row.systemId, overallScore: row.overallScore })),
  primaryEvaluationDirectory: `experiments/multi-source-lead-discovery/artifacts/runs/${runId}/primary-evaluation`,
}, null, 2));
