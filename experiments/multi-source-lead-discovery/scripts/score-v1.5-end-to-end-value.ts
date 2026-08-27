import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane, SharedEvidenceDossier } from "../lib/evidence-dossier";
import { evaluateV15EndToEnd, evidenceSupportedRoles, routesForRoles, type V15EndToEndScore } from "../lib/v1.5-end-to-end-value";
import type { V14OccurrenceScore } from "../lib/v1.4-independent-value";

interface MasterArtifact { policyVersion: string; companies: SharedEvidenceDossier[] }
interface V14Artifact { scores: V14OccurrenceScore[] }

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const experimentRoot = path.resolve("experiments/multi-source-lead-discovery");
const runRoot = path.join(experimentRoot, "artifacts/runs", runId);
const scoringRoot = path.join(runRoot, "scoring/end-to-end-value-v1.5");
const masterPath = path.join(runRoot, "evidence/shared-evidence-dossiers.v1.json");
const v14Path = path.join(runRoot, "scoring/independent-value-v1.4/all-candidate-scores.v1.4.json");
const v14LeaderboardPath = path.join(runRoot, "scoring/independent-value-v1.4/leaderboard-independent-value.v1.4.json");
const master = JSON.parse(await readFile(masterPath, "utf8")) as MasterArtifact;
const v14 = JSON.parse(await readFile(v14Path, "utf8")) as V14Artifact;
const v14Leaderboard = JSON.parse(await readFile(v14LeaderboardPath, "utf8")) as { systems: Array<{ systemId: string; rank: number; macroMeanPerTargetSlot: number }> };
const dossierById = new Map(master.companies.map((dossier) => [dossier.dossierId, dossier]));
const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];

const grouped = new Map<string, V14OccurrenceScore[]>();
for (const row of v14.scores) {
  const key = `${row.systemId}\u0000${row.dossierId}`;
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

const scores: V15EndToEndScore[] = [];
let crossLaneDuplicateOccurrencesSuppressed = 0;
let correctedRouteExpansions = 0;
for (const rows of grouped.values()) {
  const systemId = rows[0].systemId;
  const dossier = dossierById.get(rows[0].dossierId);
  if (!dossier) throw new Error(`Missing dossier ${rows[0].dossierId}`);
  if (systemId === "gemini-full") {
    for (const baseline of rows) scores.push(evaluateV15EndToEnd({
      baseline, dossier, correctedChannelId: baseline.channelId, productCorrectionApplied: false,
    }));
    continue;
  }
  crossLaneDuplicateOccurrencesSuppressed += Math.max(0, rows.length - 1);
  const seed = [...rows].sort((left, right) => left.submittedRank - right.submittedRank)[0];
  const correctedRoles = evidenceSupportedRoles(dossier);
  const correctedRoutes = routesForRoles(correctedRoles);
  const targetRoutes = correctedRoutes.length > 0 ? correctedRoutes : [...new Set(rows.map((row) => row.channelId))];
  correctedRouteExpansions += Math.max(0, targetRoutes.length - 1);
  for (const channelId of targetRoutes) {
    const sameLane = rows.find((row) => row.channelId === channelId);
    const baseline = sameLane ?? {
      ...seed,
      channelId,
      submittedRank: Math.min(...rows.map((row) => row.submittedRank)),
      levels: { ...seed.levels, cooperationPath: dossier.claimCoverage.cooperationPathCaps[channelId] },
      providerEvidenceComplete: rows.some((row) => row.providerEvidenceComplete),
      providerEvidenceItemCount: Math.max(...rows.map((row) => row.providerEvidenceItemCount)),
    };
    scores.push(evaluateV15EndToEnd({ baseline, dossier, correctedChannelId: channelId, productCorrectionApplied: true }));
  }
}

scores.sort((left, right) => left.systemId.localeCompare(right.systemId) || left.channelId.localeCompare(right.channelId)
  || right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));

function providerCompleteness(rows: V15EndToEndScore[]) {
  const complete = rows.filter((row) => row.providerEvidenceComplete).length;
  return { occurrences: rows.length, complete, incomplete: rows.length - complete,
    percentage: rows.length === 0 ? 0 : Number((complete / rows.length * 100).toFixed(2)), mainScoreWeight: 0 };
}

const systemIds = [...new Set(scores.map((score) => score.systemId))].sort();
const systems = systemIds.map((systemId) => {
  const systemRows = scores.filter((score) => score.systemId === systemId);
  const channels = lanes.map((channelId) => {
    const routed = systemRows.filter((score) => score.channelId === channelId);
    const eligible = routed.filter((score) => score.failedHardValueGates.length === 0)
      .sort((left, right) => right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
    const selected = eligible.slice(0, 10);
    const top10ScoreSum = selected.reduce((sum, row) => sum + row.score, 0);
    return { channelId, routedCanonicalCandidates: routed.length, eligibleCandidates: eligible.length,
      selectedCount: selected.length, rejectedByHardValueGate: routed.length - eligible.length,
      top10ScoreSum: Number(top10ScoreSum.toFixed(2)), meanPerTargetSlot: Number((top10ScoreSum / 10).toFixed(2)),
      meanSelectedScore: selected.length === 0 ? 0 : Number((top10ScoreSum / selected.length).toFixed(2)),
      selected: selected.map((row, index) => ({ ...row, finalRank: index + 1 })) };
  });
  return { systemId, channels,
    macroMeanPerTargetSlot: Number((channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0) / lanes.length).toFixed(2)),
    provider_evidence_completeness: providerCompleteness(systemRows) };
}).sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot || left.systemId.localeCompare(right.systemId))
  .map((system, index) => ({ ...system, rank: index + 1 }));

const policy = {
  version: "end-to-end-candidate-value-v1.5",
  comparisonTarget: "Final user-visible output after the product evidence-correction stage versus Gemini Full's own end-to-end output.",
  hardValueGates: ["companyExists", "germanyPresence", "activeNetworking"],
  removedHardGates: ["submittedLaneMembership", "uniqueCanonicalCompany", "providerEvidenceCompleteness"],
  correctionRule: "Product systems are deduplicated by canonical entity and deterministically rerouted from shared evidence-supported roles; Gemini Full retains its own submitted routing.",
  roleRoutingPolicy: "Multi-role output is allowed. ISP is routed to project-services for this three-lane benchmark.",
  weights: { productUseCaseFit: 44, cooperationPath: 32, independentInformationConfidence: 20,
    roleIdentificationQuality: 3, channelClassificationQuality: 1, maximum: 100 },
  outputClassificationShare: 4,
  provider_evidence_completeness: { mainScoreWeight: 0, diagnosticOnly: true },
  comparisonRule: "Rank corrected final output within each lane and average three fixed ten-slot lane scores.",
  humanAuditRule: "No new blind audit because the human role/fit/path judgments are unchanged; only gate semantics, routing and weights changed.",
};
const generatedAt = new Date().toISOString();
const rescuedFromOriginalZero = scores.filter((score) => score.score > 0
  && score.originalFailedValueGates.length > 0
  && score.originalFailedValueGates.every((gate) => gate === "submittedLaneMembership" || gate === "uniqueCanonicalCompany")).length;
const scoreArtifact = { schemaVersion: 1, runId, generatedAt, status: "final-rule-revision-no-new-human-audit",
  sourceEvidencePolicyVersion: master.policyVersion, policy,
  sources: { v14Scores: path.relative(experimentRoot, v14Path).replaceAll("\\", "/"),
    sharedDossiers: path.relative(experimentRoot, masterPath).replaceAll("\\", "/") },
  summary: { inputOccurrences: v14.scores.length, finalRoutedOccurrences: scores.length,
    crossLaneDuplicateOccurrencesSuppressed, correctedRouteExpansions, eligibleOccurrences: scores.filter((score) => score.failedHardValueGates.length === 0).length,
    rejectedOccurrences: scores.filter((score) => score.failedHardValueGates.length > 0).length, rescuedFromOriginalZero }, scores };
const priorRanks = new Map(v14Leaderboard.systems.map((system) => [system.systemId, system]));
const leaderboardArtifact = { schemaVersion: 1, runId, generatedAt, status: scoreArtifact.status, policy,
  interpretation: { mainRanking: "End-to-end user value after evidence correction, entity deduplication, multi-role recovery and routing correction.",
    historicalNature: "Retrospective rescore of the frozen discovery run. Product correction uses the deterministic evidence-supported minimum implemented by the new correction agent; live model/search latency is not measured.",
    provider_evidence_completeness: "Zero-weight diagnostic only." },
  systems: systems.map((system) => ({ ...system, v14Rank: priorRanks.get(system.systemId)?.rank ?? null,
    v14MacroMeanPerTargetSlot: priorRanks.get(system.systemId)?.macroMeanPerTargetSlot ?? null })) };

await mkdir(scoringRoot, { recursive: true });
await writeFile(path.join(scoringRoot, "all-candidate-scores.v1.5.json"), `${JSON.stringify(scoreArtifact, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "leaderboard-end-to-end-value.v1.5.json"), `${JSON.stringify(leaderboardArtifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runId, ...scoreArtifact.summary,
  leaderboard: leaderboardArtifact.systems.map((system) => ({ rank: system.rank, systemId: system.systemId,
    score: system.macroMeanPerTargetSlot, v14Rank: system.v14Rank })) }, null, 2));
