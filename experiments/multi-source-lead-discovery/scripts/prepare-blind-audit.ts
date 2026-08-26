import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChannelId, EvaluatedCandidate } from "../lib/evaluation";

type SystemId = string;

interface BenchmarkConfig {
  execution: { runId: string; runOrder: SystemId[] };
  scoring: {
    blindAudit: {
      samplePercent: number;
      minimumUniqueCompanies: number;
      maximumUniqueCompanies: number;
      riskSupplementMaximum: number;
      seed: string;
      identityFieldsHidden: string[];
    };
  };
}

interface InputsConfig {
  channels: Array<{ id: ChannelId; label: string }>;
}

interface EvaluationArtifact {
  systemId: SystemId;
  channelId: ChannelId;
  selectedCandidates: EvaluatedCandidate[];
}

interface Occurrence {
  systemId: SystemId;
  channelId: ChannelId;
  rank: number;
  candidate: EvaluatedCandidate;
}

interface PoolEntry {
  canonicalKey: string;
  companyName: string;
  officialUrl: string | null;
  occurrences: Occurrence[];
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const [benchmark, inputs] = await Promise.all([
  readJson<BenchmarkConfig>(path.join(root, "config/benchmark.json")),
  readJson<InputsConfig>(path.join(root, "config/inputs.json")),
]);
const runId = benchmark.execution.runId;
const rawAudit = path.join(root, "runs/raw", runId, "audit");
const artifactRoot = path.join(root, "artifacts/runs", runId);

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalName(value: string): string {
  return value.toLowerCase()
    .replace(/\b(gmbh|ag|kg|ug|mbh|se|co|ltd|limited|inc|corp|corporation)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalKey(candidate: EvaluatedCandidate): string {
  const name = canonicalName(candidate.companyName);
  if (name) return `name:${name}`;
  if (candidate.officialUrl) return `host:${new URL(candidate.officialUrl).hostname.replace(/^www\./, "")}`;
  return `unnamed:${digest(JSON.stringify(candidate)).slice(0, 16)}`;
}

function scoreBand(score: number): string {
  if (score <= 0) return "invalid";
  if (score < 50) return "low";
  if (score < 65) return "follow-up";
  if (score < 80) return "strong";
  return "high";
}

function deterministicOrder(seed: string, value: string): string {
  return digest(`${seed}:${value}`);
}

function assertNoHiddenIdentityFields(value: unknown, location = "packet"): void {
  const forbidden = new Set(["systemId", "provider", "providerId", "geminiMode", "rank", "modelScore", "score", "occurrenceCount", "cudyRelationship"]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoHiddenIdentityFields(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key)) throw new Error(`Blind audit packet leaked hidden field ${location}.${key}`);
    assertNoHiddenIdentityFields(child, `${location}.${key}`);
  }
}

const occurrences: Occurrence[] = [];
for (const systemId of benchmark.execution.runOrder) {
  for (const channel of inputs.channels) {
    const artifact = await readJson<EvaluationArtifact>(path.join(artifactRoot, "primary-evaluation", systemId, `${channel.id}.json`));
    artifact.selectedCandidates.forEach((candidate, index) => occurrences.push({
      systemId, channelId: channel.id, rank: index + 1, candidate,
    }));
  }
}

const poolMap = new Map<string, PoolEntry>();
for (const occurrence of occurrences) {
  const key = canonicalKey(occurrence.candidate);
  const existing = poolMap.get(key);
  if (existing) existing.occurrences.push(occurrence);
  else poolMap.set(key, {
    canonicalKey: key,
    companyName: occurrence.candidate.companyName,
    officialUrl: occurrence.candidate.officialUrl,
    occurrences: [occurrence],
  });
}
const pool = [...poolMap.values()].sort((left, right) => left.companyName.localeCompare(right.companyName));

await mkdir(rawAudit, { recursive: true });
const saltPath = path.join(rawAudit, ".blind-salt");
let blindSalt: string;
try {
  blindSalt = (await readFile(saltPath, "utf8")).trim();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  blindSalt = randomBytes(32).toString("hex");
  await writeFile(saltPath, blindSalt, "utf8");
}

const audit = benchmark.scoring.blindAudit;
const anchors = pool.map((entry) => {
  const anchor = [...entry.occurrences].sort((left, right) =>
    deterministicOrder(`${audit.seed}:anchor:${entry.canonicalKey}`, `${left.systemId}:${left.channelId}:${left.rank}`)
      .localeCompare(deterministicOrder(`${audit.seed}:anchor:${entry.canonicalKey}`, `${right.systemId}:${right.channelId}:${right.rank}`)))[0];
  return {
    entry,
    anchor,
    blindCandidateId: `C-${digest(`${blindSalt}:${entry.canonicalKey}`).slice(0, 12).toUpperCase()}`,
    stratum: `${anchor.channelId}:${scoreBand(anchor.candidate.score)}`,
  };
});

const target = Math.min(pool.length, Math.max(
  audit.minimumUniqueCompanies,
  Math.min(audit.maximumUniqueCompanies, Math.ceil(pool.length * audit.samplePercent / 100)),
));
const selected = new Set<string>();
const strata = new Map<string, typeof anchors>();
for (const anchor of anchors) strata.set(anchor.stratum, [...(strata.get(anchor.stratum) ?? []), anchor]);
for (const [stratum, values] of strata) {
  const first = [...values].sort((left, right) =>
    deterministicOrder(`${audit.seed}:stratum:${stratum}`, left.blindCandidateId)
      .localeCompare(deterministicOrder(`${audit.seed}:stratum:${stratum}`, right.blindCandidateId)))[0];
  if (selected.size < target) selected.add(first.blindCandidateId);
}
for (const anchor of [...anchors].sort((left, right) =>
  deterministicOrder(`${audit.seed}:fill`, left.blindCandidateId)
    .localeCompare(deterministicOrder(`${audit.seed}:fill`, right.blindCandidateId)))) {
  if (selected.size >= target) break;
  selected.add(anchor.blindCandidateId);
}

const riskEligible = anchors.filter((anchor) => !selected.has(anchor.blindCandidateId) && (
  new Set(anchor.entry.occurrences.map((item) => item.channelId)).size > 1
  || anchor.anchor.candidate.levels.evidenceReliability <= 1
  || Math.abs(anchor.anchor.candidate.score - 50) <= 5
)).sort((left, right) => deterministicOrder(`${audit.seed}:risk`, left.blindCandidateId)
  .localeCompare(deterministicOrder(`${audit.seed}:risk`, right.blindCandidateId)));
const riskIds = new Set(riskEligible.slice(0, audit.riskSupplementMaximum).map((anchor) => anchor.blindCandidateId));

function packetEntry(anchor: typeof anchors[number], sampleType: "core" | "risk-supplement") {
  const candidate = anchor.anchor.candidate;
  return {
    blindCandidateId: anchor.blindCandidateId,
    sampleType,
    companyName: candidate.companyName,
    officialUrl: candidate.officialUrl,
    evidenceItems: candidate.evidenceItems,
    reviewerTask: {
      determineGates: ["companyExists", "germanyPresence", "networkingRelevant", "sufficientEvidence"],
      chooseValidCategory: ["tier1-distribution", "b2b-resale", "project-services", "none-or-unclear"],
      assignIntegerLevels: { productUseCaseFit: "0-5", cooperationPath: "0-5", evidenceReliability: "0-5" },
    },
  };
}

const packet = anchors.flatMap((anchor) => selected.has(anchor.blindCandidateId)
  ? [packetEntry(anchor, "core")] : riskIds.has(anchor.blindCandidateId)
    ? [packetEntry(anchor, "risk-supplement")] : [])
  .sort((left, right) => left.blindCandidateId.localeCompare(right.blindCandidateId));
const decisions = packet.map((entry) => ({
  blindCandidateId: entry.blindCandidateId,
  gates: { companyExists: null, germanyPresence: null, networkingRelevant: null, sufficientEvidence: null },
  validCategory: null,
  levels: { productUseCaseFit: null, cooperationPath: null, evidenceReliability: null },
  reviewerNotes: "",
}));
assertNoHiddenIdentityFields(packet);

await writeJson(path.join(rawAudit, "blind-identity-map.local.json"), {
  runId,
  identities: anchors.map((anchor) => ({
    blindCandidateId: anchor.blindCandidateId,
    canonicalKey: anchor.entry.canonicalKey,
    anchorSystemId: anchor.anchor.systemId,
    anchorChannelId: anchor.anchor.channelId,
    anchorRank: anchor.anchor.rank,
    anchorModelCandidate: anchor.anchor.candidate,
    allOccurrences: anchor.entry.occurrences,
  })),
});
await writeJson(path.join(rawAudit, "human-audit-decisions.local.template.json"), { schemaVersion: 1, runId, decisions });
await writeJson(path.join(artifactRoot, "evidence/deduplicated-candidate-pool.json"), {
  schemaVersion: 1,
  runId,
  uniqueCompanyCount: pool.length,
  submittedOccurrenceCount: occurrences.length,
  companies: pool.map((entry) => ({
    companyName: entry.companyName,
    officialUrl: entry.officialUrl,
    occurrenceCount: entry.occurrences.length,
    occurrences: entry.occurrences.map((occurrence) => ({
      systemId: occurrence.systemId,
      channelId: occurrence.channelId,
      rank: occurrence.rank,
      roles: occurrence.candidate.roles,
      score: occurrence.candidate.score,
      evidenceItems: occurrence.candidate.evidenceItems,
    })),
  })),
});
await writeJson(path.join(artifactRoot, "scoring/blind-audit-manifest.json"), {
  schemaVersion: 1,
  runId,
  providerIdentityHidden: true,
  hiddenFields: audit.identityFieldsHidden,
  poolUniqueCompanies: pool.length,
  coreSampleSize: selected.size,
  coreSamplePercent: pool.length ? selected.size / pool.length : 0,
  riskSupplementSize: riskIds.size,
  samplingSeed: audit.seed,
  identityMapCommitted: false,
  reviewerDecisionStatus: "pending",
});
await writeJson(path.join(artifactRoot, "scoring/blind-audit-packet.json"), {
  schemaVersion: 1,
  runId,
  instructions: "Provider, system, Gemini mode, rank, model score, occurrence count and relationship status are hidden. Judge only supplied public evidence using the frozen rubric.",
  candidates: packet,
});

console.log(JSON.stringify({
  runId,
  uniqueCompanies: pool.length,
  occurrences: occurrences.length,
  coreSample: selected.size,
  riskSupplement: riskIds.size,
  packet: `experiments/multi-source-lead-discovery/artifacts/runs/${runId}/scoring/blind-audit-packet.json`,
  localDecisionTemplate: `experiments/multi-source-lead-discovery/runs/raw/${runId}/audit/human-audit-decisions.local.template.json`,
}, null, 2));
