import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane, SharedEvidenceDossier } from "../lib/evidence-dossier";
import {
  evaluateV14Occurrence,
  independentDecisionKey,
  validateIndependentDecisions,
  type IndependentDecisionArtifact,
  type V14OccurrenceScore,
} from "../lib/v1.4-independent-value";
import type { V13OccurrenceScore } from "../lib/v1.3-rescoring";

interface MasterArtifact {
  schemaVersion: number;
  policyVersion: string;
  runId: string;
  companies: SharedEvidenceDossier[];
}

interface V13ScoreArtifact {
  scores: Array<Omit<V13OccurrenceScore, "evidence">>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const experimentRoot = path.resolve("experiments/multi-source-lead-discovery");
const runRoot = path.join(experimentRoot, "artifacts/runs", runId);
const scoringRoot = path.join(runRoot, "scoring/independent-value-v1.4");
const masterPath = path.join(runRoot, "evidence/shared-evidence-dossiers.v1.json");
const baselinePath = path.join(runRoot, "scoring/calibrated/all-candidate-scores.v1.3.1.json");
const decisionPath = path.join(runRoot, "evaluation/v1.4/gemini-full-independent-decisions.json");

const master = JSON.parse(await readFile(masterPath, "utf8")) as MasterArtifact;
const baselineArtifact = JSON.parse(await readFile(baselinePath, "utf8")) as V13ScoreArtifact;
const decisionArtifact = JSON.parse(await readFile(decisionPath, "utf8")) as IndependentDecisionArtifact;
validateIndependentDecisions({ artifact: decisionArtifact, dossiers: master.companies });

const dossierById = new Map(master.companies.map((dossier) => [dossier.dossierId, dossier]));
const decisionByKey = new Map(decisionArtifact.decisions.map((decision) => [
  independentDecisionKey(decision.dossierId, decision.channelId), decision,
]));
const scores: V14OccurrenceScore[] = baselineArtifact.scores.map((baseline) => {
  const dossier = dossierById.get(baseline.dossierId);
  if (!dossier) throw new Error(`Missing dossier for baseline occurrence: ${baseline.dossierId}`);
  return evaluateV14Occurrence({
    baseline,
    dossier,
    decision: decisionByKey.get(independentDecisionKey(baseline.dossierId, baseline.channelId)),
  });
}).sort((left, right) => left.systemId.localeCompare(right.systemId) || left.channelId.localeCompare(right.channelId)
  || right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));

const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];
const systemIds = [...new Set(scores.map((score) => score.systemId))].sort();

function providerCompleteness(rows: V14OccurrenceScore[]) {
  const completeOccurrences = rows.filter((row) => row.providerEvidenceComplete).length;
  return {
    submittedCanonicalOccurrences: rows.length,
    completeOccurrences,
    incompleteOccurrences: rows.length - completeOccurrences,
    percentage: rows.length === 0 ? 0 : Number((completeOccurrences / rows.length * 100).toFixed(2)),
    mainScoreWeight: 0,
  };
}

const systems = systemIds.map((systemId) => {
  const systemRows = scores.filter((score) => score.systemId === systemId);
  const channels = lanes.map((channelId) => {
    const submitted = systemRows.filter((score) => score.channelId === channelId);
    const eligible = submitted.filter((score) => score.failedValueGates.length === 0
      && score.independentDecisionStatus !== "verified-fail")
      .sort((left, right) => right.score - left.score || left.submittedRank - right.submittedRank
        || left.companyName.localeCompare(right.companyName));
    const selected = eligible.slice(0, 10);
    const top10ScoreSum = selected.reduce((sum, row) => sum + row.score, 0);
    return {
      channelId,
      submittedCanonicalCandidates: submitted.length,
      eligibleCandidates: eligible.length,
      selectedCount: selected.length,
      rejectedByValueGate: submitted.length - eligible.length,
      top10ScoreSum,
      meanPerTargetSlot: Number((top10ScoreSum / 10).toFixed(2)),
      meanSelectedScore: selected.length === 0 ? 0 : Number((top10ScoreSum / selected.length).toFixed(2)),
      provider_evidence_completeness: providerCompleteness(submitted),
      selected: selected.map((row, index) => ({ ...row, finalRank: index + 1 })),
    };
  });
  return {
    systemId,
    channels,
    macroMeanPerTargetSlot: Number((channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0)
      / lanes.length).toFixed(2)),
    provider_evidence_completeness: providerCompleteness(systemRows),
  };
}).sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot
  || left.systemId.localeCompare(right.systemId))
  .map((system, index) => ({ ...system, rank: index + 1 }));

const generatedAt = new Date().toISOString();
const policy = {
  version: "independent-candidate-value-v1.4",
  mainValueGates: ["companyExists", "germanyPresence", "activeNetworking", "submittedLaneMembership", "uniqueCanonicalCompany"],
  providerSubmissionRule: "Provider citations and provider-authored summaries never decide truth or eligibility.",
  independentDecisionRule: "Only verified-fail can force a specially adjudicated candidate to zero; unresolved decisions prevent finalization.",
  sharingRule: "An independent decision is keyed by canonical company plus submitted lane and reused across every system occurrence.",
  weights: { productUseCaseFit: 9, cooperationPath: 7, independentInformationConfidence: 4, maximum: 100 },
  provider_evidence_completeness: { mainScoreWeight: 0, isTruthMetric: false },
  comparisonRule: "Rank within each channel and average three fixed ten-slot channel scores.",
  humanAuditRule: "No new blind audit; v1.3 confirmed role, lane, fit and cooperation-path judgments are unchanged.",
};

const scoreArtifact = {
  schemaVersion: 1,
  runId,
  generatedAt,
  status: "final-no-new-human-audit",
  sourceEvidencePolicyVersion: master.policyVersion,
  policy,
  sources: {
    baseline: path.relative(experimentRoot, baselinePath).replaceAll("\\", "/"),
    sharedDossiers: path.relative(experimentRoot, masterPath).replaceAll("\\", "/"),
    independentDecisions: path.relative(experimentRoot, decisionPath).replaceAll("\\", "/"),
  },
  summary: {
    occurrenceCount: scores.length,
    independentlyAdjudicatedOccurrences: scores.filter((score) => score.evaluationBasis === "v1.4-independent-adjudication").length,
    independentDecisionCount: decisionArtifact.decisions.length,
    independentPassCount: decisionArtifact.decisions.filter((decision) => decision.status === "verified-pass").length,
    independentFailCount: decisionArtifact.decisions.filter((decision) => decision.status === "verified-fail").length,
    unresolvedDecisionCount: decisionArtifact.decisions.filter((decision) => decision.status === "unresolved").length,
    valueEligibleOccurrences: scores.filter((score) => score.failedValueGates.length === 0
      && score.independentDecisionStatus !== "verified-fail").length,
  },
  scores,
};

const leaderboardArtifact = {
  schemaVersion: 1,
  runId,
  generatedAt,
  status: "final-no-new-human-audit",
  policy,
  interpretation: {
    mainRanking: "Candidate value after provider-neutral verification and confirmed v1.3 calibration.",
    provider_evidence_completeness: "Zero-weight structural diagnostic only; it is neither a correctness score nor a value gate.",
    geminiHistory: {
      v1_2_nativeRawUnaccepted: 78.5,
      v1_3_1_evidencePipelineLowerBound: 1.7,
      v1_4: "Use the independently adjudicated main-ranking value below.",
    },
  },
  systems,
};

await mkdir(scoringRoot, { recursive: true });
await writeFile(path.join(scoringRoot, "all-candidate-scores.v1.4.json"), `${JSON.stringify(scoreArtifact, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "leaderboard-independent-value.v1.4.json"), `${JSON.stringify(leaderboardArtifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  runId,
  ...scoreArtifact.summary,
  leaderboard: systems.map((system) => ({
    rank: system.rank,
    systemId: system.systemId,
    macroMeanPerTargetSlot: system.macroMeanPerTargetSlot,
    provider_evidence_completeness: system.provider_evidence_completeness.percentage,
  })),
}, null, 2));
