import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane } from "../lib/evidence-dossier";
import type { V13Eligibility, V13Levels, V13OccurrenceScore } from "../lib/v1.3-rescoring";

type ScoreRow = Omit<V13OccurrenceScore, "evidence">;
type SampleType = "core" | "problem";
interface Decision {
  blindCandidateId: string;
  companyName: string;
  officialUrl: string | null;
  reviewLane: BenchmarkLane;
  gates: Record<"companyExists" | "germanyPresence" | "activeNetworking" | "sufficientEvidence", boolean>;
  supportedCategories: Array<BenchmarkLane | "none-or-unclear">;
  submittedLanePass: boolean;
  levels: V13Levels;
  reviewerNotes: string;
}
interface Checkpoint { runId: string; auditVersion: string; decisions: Decision[] }
interface Identity { blindCandidateId: string; row: ScoreRow; sampleType: SampleType; selectionReason: string }
interface IdentityMap { runId: string; identities: Identity[] }
interface Leaderboard { runId: string; policy: unknown; systems: unknown[] }
interface ScoreArtifact { runId: string; scores: ScoreRow[] }

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const recalibrated = process.argv.includes("--recalibrated");
const root = path.resolve("experiments/multi-source-lead-discovery");
const artifactRoot = path.join(root, "artifacts/runs", runId);
const [checkpoint, identityMap, leaderboard, recalibratedScores] = await Promise.all([
  readFile(path.join(artifactRoot, "scoring/human-audit-decisions.blind.json"), "utf8").then((value) => JSON.parse(value) as Checkpoint),
  readFile(path.join(root, "runs/raw", runId, "audit/blind-identity-map.local.json"), "utf8").then((value) => JSON.parse(value) as IdentityMap),
  readFile(path.join(artifactRoot, recalibrated
    ? "scoring/calibrated/leaderboard-post-rule-revision.v1.3.1.json"
    : "scoring/leaderboard-pre-human-audit.json"), "utf8").then((value) => JSON.parse(value) as Leaderboard),
  recalibrated
    ? readFile(path.join(artifactRoot, "scoring/calibrated/all-candidate-scores.v1.3.1.json"), "utf8")
      .then((value) => JSON.parse(value) as ScoreArtifact)
    : Promise.resolve(null),
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function mean(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value: number, digits = 4): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function candidateScore(levels: V13Levels): number {
  return levels.productUseCaseFit * 9 + levels.cooperationPath * 7 + levels.evidenceReliability * 4;
}
function humanEligible(decision: Decision): boolean {
  return Object.values(decision.gates).every(Boolean) && decision.submittedLanePass;
}
function machineCommonGates(row: ScoreRow): Decision["gates"] {
  return {
    companyExists: row.eligibility.companyExists,
    germanyPresence: row.eligibility.germanyPresence,
    activeNetworking: row.eligibility.activeNetworking,
    sufficientEvidence: row.eligibility.sufficientEvidence,
  };
}
function scoreBandIndex(score: number): number {
  if (score <= 0) return 0;
  if (score < 50) return 1;
  if (score < 65) return 2;
  if (score < 80) return 3;
  return 4;
}
function scoreBand(score: number): string { return ["invalid", "low", "follow-up", "strong", "high"][scoreBandIndex(score)]; }
function quadraticWeightedKappa(left: number[], right: number[], categoryCount = 5): number {
  if (left.length !== right.length || left.length === 0) return 0;
  const weights = Array.from({ length: categoryCount }, (_, row) =>
    Array.from({ length: categoryCount }, (_, column) => ((row - column) ** 2) / ((categoryCount - 1) ** 2)));
  const leftMarginal = Array.from({ length: categoryCount }, () => 0);
  const rightMarginal = Array.from({ length: categoryCount }, () => 0);
  let observed = 0;
  left.forEach((value, index) => {
    observed += weights[value][right[index]];
    leftMarginal[value] += 1;
    rightMarginal[right[index]] += 1;
  });
  observed /= left.length;
  let expected = 0;
  for (let row = 0; row < categoryCount; row += 1) for (let column = 0; column < categoryCount; column += 1) {
    expected += weights[row][column] * (leftMarginal[row] / left.length) * (rightMarginal[column] / left.length);
  }
  return expected === 0 ? (observed === 0 ? 1 : 0) : 1 - observed / expected;
}

assert(checkpoint.runId === runId && identityMap.runId === runId && leaderboard.runId === runId, "Audit artifacts must share the run ID");
assert(checkpoint.decisions.length === 12 && identityMap.identities.length === 12, "Expected 12 frozen decisions and identities");
const identityById = new Map(identityMap.identities.map((identity) => [identity.blindCandidateId, identity]));
const recalibratedScoreByKey = new Map((recalibratedScores?.scores ?? []).map((row) => [
  `${row.dossierId}\u0000${row.systemId}\u0000${row.channelId}`, row,
]));
const comparisons = checkpoint.decisions.map((decision) => {
  const identity = identityById.get(decision.blindCandidateId);
  assert(identity, `Missing identity for ${decision.blindCandidateId}`);
  const row = recalibratedScoreByKey.get(`${identity.row.dossierId}\u0000${identity.row.systemId}\u0000${identity.row.channelId}`)
    ?? identity.row;
  const commonMachine = machineCommonGates(row);
  const gateAgreement = Object.fromEntries(Object.keys(decision.gates).map((key) => {
    const gate = key as keyof Decision["gates"];
    return [gate, decision.gates[gate] === commonMachine[gate]];
  })) as Record<keyof Decision["gates"], boolean>;
  const machineLanePass = row.eligibility.submittedLaneMembership;
  const humanScore = humanEligible(decision) ? candidateScore(decision.levels) : 0;
  const machineScore = row.score;
  return {
    blindCandidateId: decision.blindCandidateId,
    sampleType: identity.sampleType,
    selectionReason: identity.selectionReason,
    companyName: decision.companyName,
    anchor: { systemId: row.systemId, channelId: row.channelId, submittedRank: row.submittedRank },
    machine: {
      gates: commonMachine,
      submittedLanePass: machineLanePass,
      supportedRoles: row.supportedRoles,
      levels: row.levels,
      score: machineScore,
      scoreBand: scoreBand(machineScore),
      failedGates: row.failedGates,
    },
    human: {
      gates: decision.gates,
      submittedLanePass: decision.submittedLanePass,
      supportedCategories: decision.supportedCategories,
      levels: decision.levels,
      score: humanScore,
      scoreBand: scoreBand(humanScore),
      reviewerNotes: decision.reviewerNotes,
    },
    comparison: {
      gateAgreement,
      allCommonGatesAgree: Object.values(gateAgreement).every(Boolean),
      submittedLaneAgrees: machineLanePass === decision.submittedLanePass,
      levelDifferenceMachineMinusHuman: {
        productUseCaseFit: row.levels.productUseCaseFit - decision.levels.productUseCaseFit,
        cooperationPath: row.levels.cooperationPath - decision.levels.cooperationPath,
        evidenceReliability: row.levels.evidenceReliability - decision.levels.evidenceReliability,
      },
      scoreDifferenceMachineMinusHuman: machineScore - humanScore,
      absoluteScoreError: Math.abs(machineScore - humanScore),
      scoreBandAgrees: scoreBandIndex(machineScore) === scoreBandIndex(humanScore),
    },
  };
});

const core = comparisons.filter((item) => item.sampleType === "core");
const problem = comparisons.filter((item) => item.sampleType === "problem");
assert(core.length === 6 && problem.length === 6, "Expected six core and six problem cases after deblinding");
const gates = ["companyExists", "germanyPresence", "activeNetworking", "sufficientEvidence"] as const;
const gateAgreementByField = Object.fromEntries(gates.map((gate) => [gate,
  round(core.filter((item) => item.comparison.gateAgreement[gate]).length / core.length),
])) as Record<typeof gates[number], number>;
const allGateFields = core.flatMap((item) => Object.values(item.comparison.gateAgreement));
const laneConfusion = {
  truePositive: core.filter((item) => item.machine.submittedLanePass && item.human.submittedLanePass).length,
  trueNegative: core.filter((item) => !item.machine.submittedLanePass && !item.human.submittedLanePass).length,
  falsePositive: core.filter((item) => item.machine.submittedLanePass && !item.human.submittedLanePass).length,
  falseNegative: core.filter((item) => !item.machine.submittedLanePass && item.human.submittedLanePass).length,
};
const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];
const categoryBias = lanes.map((channelId) => {
  const rows = core.filter((item) => item.anchor.channelId === channelId);
  const differences = rows.map((item) => item.comparison.scoreDifferenceMachineMinusHuman);
  return { channelId, auditedCandidates: rows.length, machineMinusHumanMeanBias: round(mean(differences)), absoluteMeanBias: round(Math.abs(mean(differences))) };
});
const metrics = {
  coreSampleSize: core.length,
  problemDiagnosticSize: problem.length,
  gateFieldAgreement: round(allGateFields.filter(Boolean).length / allGateFields.length),
  gateAgreementByField,
  completeCommonGateVectorAgreement: round(core.filter((item) => item.comparison.allCommonGatesAgree).length / core.length),
  submittedLaneAgreement: round(core.filter((item) => item.comparison.submittedLaneAgrees).length / core.length),
  submittedLaneConfusion: laneConfusion,
  scoreBandExactAgreement: round(core.filter((item) => item.comparison.scoreBandAgrees).length / core.length),
  quadraticWeightedKappa: round(quadraticWeightedKappa(
    core.map((item) => scoreBandIndex(item.machine.score)), core.map((item) => scoreBandIndex(item.human.score)))),
  scoreMeanAbsoluteError: round(mean(core.map((item) => item.comparison.absoluteScoreError))),
  overallMachineMinusHumanMeanBias: round(mean(core.map((item) => item.comparison.scoreDifferenceMachineMinusHuman))),
  levelMeanAbsoluteError: {
    productUseCaseFit: round(mean(core.map((item) => Math.abs(item.comparison.levelDifferenceMachineMinusHuman.productUseCaseFit)))),
    cooperationPath: round(mean(core.map((item) => Math.abs(item.comparison.levelDifferenceMachineMinusHuman.cooperationPath)))),
    evidenceReliability: round(mean(core.map((item) => Math.abs(item.comparison.levelDifferenceMachineMinusHuman.evidenceReliability)))),
  },
  categoryBias,
};

const thresholds = {
  gateAgreementMinimum: 0.9,
  submittedLaneAgreementMinimum: 0.9,
  weightedKappaMinimum: 0.75,
  scoreMeanAbsoluteErrorMaximum: 8,
  absoluteCategoryMeanBiasMaximum: 5,
};
const failedThresholds = [
  ...(metrics.gateFieldAgreement < thresholds.gateAgreementMinimum ? ["gateAgreement"] : []),
  ...(metrics.submittedLaneAgreement < thresholds.submittedLaneAgreementMinimum ? ["submittedLaneAgreement"] : []),
  ...(metrics.quadraticWeightedKappa < thresholds.weightedKappaMinimum ? ["weightedKappa"] : []),
  ...(metrics.scoreMeanAbsoluteError > thresholds.scoreMeanAbsoluteErrorMaximum ? ["scoreMeanAbsoluteError"] : []),
  ...(metrics.categoryBias.some((row) => row.absoluteMeanBias > thresholds.absoluteCategoryMeanBiasMaximum) ? ["absoluteCategoryMeanBias"] : []),
];
const structuralFailure = failedThresholds.includes("gateAgreement") || failedThresholds.includes("submittedLaneAgreement");
const calibrationDecision = structuralFailure ? {
  status: recalibrated ? "failed-post-rule-structural-calibration" : "failed-structural-calibration",
  rawScoresChanged: recalibrated,
  leaderboardStatus: recalibrated ? "post-rule-revision-further-revision-required" : "provisional-rule-revision-required",
  requiredAction: "Revise executable gate/lane recognition from human disagreement reasons and rescore the full pool; numeric offsets are prohibited.",
} : failedThresholds.length ? {
  status: recalibrated ? "post-rule-numeric-calibration-review-required" : "numeric-calibration-review-required",
  rawScoresChanged: recalibrated,
  leaderboardStatus: "provisional-pending-uniform-lane-correction",
  requiredAction: "Review one uniform per-lane correction capped at +/-8; system-specific correction is prohibited.",
} : recalibrated ? {
  status: "in-sample-rule-calibration-fit-passed",
  rawScoresChanged: true,
  leaderboardStatus: "post-rule-revision-independent-validation-pending",
  requiredAction: "Treat the revised full-pool scores as calibrated but provisional; the same 12 cases trained the rule changes, so an independent holdout is required before declaring a winner.",
} : {
  status: "accepted-with-small-sample-uncertainty",
  rawScoresChanged: false,
  leaderboardStatus: "accepted",
  requiredAction: "Retain raw scores and report the six-core-case uncertainty limitation.",
};

const result = {
  schemaVersion: 1,
  runId,
  auditVersion: checkpoint.auditVersion,
  evaluationView: recalibrated ? "post-human-rule-revision-v1.3.1-in-sample-fit" : "pre-human-rule-revision-v1.3",
  humanAuditCheckpointCommit: "95df76d",
  humanDecisionsFrozenBeforeDeblinding: true,
  thresholds,
  metricDefinitions: {
    representativeStatistics: "Six core samples only; six deliberately difficult problem cases are diagnostic and excluded from acceptance metrics.",
    gateAgreement: "Field agreement over identity, Germany presence, active networking and evidence sufficiency.",
    submittedLaneAgreement: "Agreement on whether evidence supports any eligible role in the submitted lane; no primary role is required.",
    scoreError: "Machine versus human weighted score after each side's gates and submitted-lane decision are applied.",
  },
  metrics,
  passed: failedThresholds.length === 0,
  failedThresholds,
  calibrationDecision,
  coreComparisons: core,
  problemDiagnostics: problem,
};
const comparisonOutput = path.join(artifactRoot, recalibrated
  ? "scoring/calibrated/human-audit-recalibration-fit.v1.3.1.json"
  : "scoring/human-audit-comparison.json");
const leaderboardOutput = path.join(artifactRoot, recalibrated
  ? "scoring/calibrated/leaderboard-post-human-audit.v1.3.1.json"
  : "scoring/leaderboard-post-human-audit.json");
await mkdir(path.dirname(comparisonOutput), { recursive: true });
await writeFile(comparisonOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(leaderboardOutput, `${JSON.stringify({
  schemaVersion: 1,
  runId,
  status: calibrationDecision.leaderboardStatus,
  scoresAreRawAndUnchanged: !recalibrated,
  finalWinnerDeclared: false,
  failedThresholds,
  calibrationDecision,
  policy: leaderboard.policy,
  systems: leaderboard.systems,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ metrics, failedThresholds, calibrationDecision, comparisonOutput: path.relative(process.cwd(), comparisonOutput) }, null, 2));
