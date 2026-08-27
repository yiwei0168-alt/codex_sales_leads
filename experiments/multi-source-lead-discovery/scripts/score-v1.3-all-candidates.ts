import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane, SharedEvidenceDossier } from "../lib/evidence-dossier";
import { evaluateV13Occurrence, type V13OccurrenceScore } from "../lib/v1.3-rescoring";

interface MasterArtifact {
  schemaVersion: number;
  policyVersion: string;
  runId: string;
  companies: SharedEvidenceDossier[];
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const calibrated = process.argv.includes("--calibrated");
const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId);
const master = JSON.parse(await readFile(path.join(runRoot, "evidence/shared-evidence-dossiers.v1.json"), "utf8")) as MasterArtifact;
const scoringRoot = path.join(runRoot, calibrated ? "scoring/calibrated" : "scoring");
await mkdir(scoringRoot, { recursive: true });

type CompactScore = Omit<V13OccurrenceScore, "evidence">;
type SharedLaneScore = Omit<CompactScore, "systemId" | "submittedRank">;
const scoreByOccurrenceKey = new Map<string, CompactScore>();
const sharedLaneScoreCache = new Map<string, SharedLaneScore>();
let duplicateCanonicalOccurrencesSuppressed = 0;
for (const dossier of master.companies) {
  for (const occurrence of dossier.submittedOccurrences) {
    const key = `${occurrence.systemId}\u0000${occurrence.channelId}\u0000${dossier.dossierId}`;
    const sharedKey = `${occurrence.channelId}\u0000${dossier.dossierId}`;
    let shared = sharedLaneScoreCache.get(sharedKey);
    if (!shared) {
      const score = evaluateV13Occurrence({ dossier, occurrence });
      const { evidence: _evidence, systemId: _systemId, submittedRank: _submittedRank, ...assessment } = score;
      shared = assessment;
      sharedLaneScoreCache.set(sharedKey, shared);
    }
    const compact: CompactScore = { ...shared, systemId: occurrence.systemId, submittedRank: occurrence.rank };
    const existing = scoreByOccurrenceKey.get(key);
    if (!existing || compact.submittedRank < existing.submittedRank) scoreByOccurrenceKey.set(key, compact);
    if (existing) duplicateCanonicalOccurrencesSuppressed += 1;
  }
}

const scores = [...scoreByOccurrenceKey.values()].sort((left, right) =>
  left.systemId.localeCompare(right.systemId) || left.channelId.localeCompare(right.channelId)
  || right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];
const systemIds = [...new Set(scores.map((score) => score.systemId))].sort();
const leaderboard = systemIds.map((systemId) => {
  const channels = lanes.map((channelId) => {
    const submitted = scores.filter((score) => score.systemId === systemId && score.channelId === channelId);
    const eligible = submitted.filter((score) => score.failedGates.length === 0)
      .sort((left, right) => right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
    const selected = eligible.slice(0, 10);
    const top10ScoreSum = selected.reduce((sum, item) => sum + item.score, 0);
    return {
      channelId,
      submittedCanonicalCandidates: submitted.length,
      eligibleCandidates: eligible.length,
      selectedCount: selected.length,
      rejectedByGate: submitted.length - eligible.length,
      top10ScoreSum,
      meanPerTargetSlot: Number((top10ScoreSum / 10).toFixed(2)),
      meanSelectedScore: selected.length === 0 ? 0
        : Number((top10ScoreSum / selected.length).toFixed(2)),
      selected: selected.map((item, index) => ({ ...item, finalRank: index + 1 })),
    };
  });
  return {
    systemId,
    channels,
    macroMeanPerTargetSlot: Number((channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0) / lanes.length).toFixed(2)),
  };
}).sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot || left.systemId.localeCompare(right.systemId));

const policy = {
  version: calibrated ? "all-candidate-shared-evidence-rescoring-v1.3.1-human-rule-revision"
    : "all-candidate-shared-evidence-rescoring-v1.3",
  scope: "Every unique canonical system-by-lane occurrence is rescored from the same provider-neutral dossier.",
  discoveryEvidenceBoundary: "Search snippets, Places content and provider summaries are excluded from scoring evidence.",
  gates: ["companyExists", "germanyPresence", "activeNetworking", "submittedLaneMembership", "sufficientEvidence", "uniqueCanonicalCompany"],
  multiRoleRule: "Every evidence-supported role is retained; no primary role is required.",
  weights: { productUseCaseFit: 9, cooperationPath: 7, evidenceReliability: 4, maximum: 100 },
  comparisonRule: "Rank only within the same channel. Each system/channel contributes at most its best ten eligible candidates.",
  missingSlotRule: "A missing eligible candidate contributes zero to that channel's fixed ten target slots.",
};

const scoreArtifact = {
  schemaVersion: 1,
  runId,
  generatedAt: new Date().toISOString(),
  sourceEvidencePolicyVersion: master.policyVersion,
  policy,
  summary: {
    canonicalCompanies: master.companies.length,
    rawSubmittedOccurrences: master.companies.reduce((sum, company) => sum + company.submittedOccurrences.length, 0),
    uniqueSystemLaneCompanyOccurrences: scores.length,
    duplicateCanonicalOccurrencesSuppressed,
    eligibleOccurrences: scores.filter((score) => score.failedGates.length === 0).length,
    rejectedOccurrences: scores.filter((score) => score.failedGates.length > 0).length,
  },
  scores,
};
const leaderboardArtifact = {
  schemaVersion: 1,
  runId,
  generatedAt: scoreArtifact.generatedAt,
  status: calibrated ? "post-human-rule-revision-in-sample-validation-pending" : "pre-human-calibration",
  policy,
  systems: leaderboard,
};

const scoreFilename = calibrated ? "all-candidate-scores.v1.3.1.json" : "all-candidate-scores.json";
const leaderboardFilename = calibrated ? "leaderboard-post-rule-revision.v1.3.1.json" : "leaderboard-pre-human-audit.json";
await writeFile(path.join(scoringRoot, scoreFilename), `${JSON.stringify(scoreArtifact, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, leaderboardFilename), `${JSON.stringify(leaderboardArtifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  runId,
  calibrated,
  ...scoreArtifact.summary,
  leaderboard: leaderboard.map((system) => ({ systemId: system.systemId, macroMeanPerTargetSlot: system.macroMeanPerTargetSlot })),
}, null, 2));
