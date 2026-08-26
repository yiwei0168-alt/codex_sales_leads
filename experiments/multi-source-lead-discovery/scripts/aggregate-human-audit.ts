import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { candidateScore, passesAllGates, type ChannelId, type EvaluatedCandidate, type ScoreLevels } from "../lib/evaluation";

type HumanCategory = ChannelId | "none-or-unclear";
type SampleType = "core" | "problem";

interface BenchmarkConfig {
  protocolVersion: string;
  execution: { runId: string };
  scoring: {
    blindAudit: {
      auditVersion: string;
      acceptance: {
        gateAgreementMinimum: number;
        categoryAgreementMinimum: number;
        weightedKappaMinimum: number;
        scoreMeanAbsoluteErrorMaximum: number;
        absoluteCategoryMeanBiasMaximum: number;
      };
    };
  };
}

interface HumanDecision {
  blindCandidateId: string;
  sampleType: SampleType;
  companyName: string;
  officialUrl: string | null;
  gates: {
    companyExists: boolean;
    germanyPresence: boolean;
    networkingRelevant: boolean;
    sufficientEvidence: boolean;
  };
  validCategory: HumanCategory;
  levels: ScoreLevels;
  reviewerNotes: string;
}

interface HumanCheckpoint {
  protocolVersion: string;
  auditVersion: string;
  runId: string;
  decisions: HumanDecision[];
}

interface Occurrence {
  systemId: string;
  channelId: ChannelId;
  rank: number;
  candidate: EvaluatedCandidate;
}

interface Identity {
  blindCandidateId: string;
  canonicalKey: string;
  anchorSystemId: string;
  anchorChannelId: ChannelId;
  anchorRank: number;
  anchorModelCandidate: EvaluatedCandidate;
  allOccurrences: Occurrence[];
}

interface IdentityMap {
  runId: string;
  identities: Identity[];
}

interface RawLeaderboard {
  schemaVersion: number;
  protocolVersion: string;
  runId: string;
  rankingMetric: string;
  leaderboard: unknown[];
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const benchmark = await readJson<BenchmarkConfig>(path.join(root, "config/benchmark.json"));
const runId = benchmark.execution.runId;
const artifactRoot = path.join(root, "artifacts/runs", runId);
const [human, identityMap, rawLeaderboard] = await Promise.all([
  readJson<HumanCheckpoint>(path.join(artifactRoot, "scoring/human-audit-decisions.blind.json")),
  readJson<IdentityMap>(path.join(root, "runs/raw", runId, "audit/blind-identity-map.local.json")),
  readJson<RawLeaderboard>(path.join(artifactRoot, "scoring/leaderboard-pre-human-audit.json")),
]);

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function allHumanGatesPass(decision: HumanDecision): boolean {
  return Object.values(decision.gates).every(Boolean) && decision.validCategory !== "none-or-unclear";
}

function scoreBandIndex(score: number): number {
  if (score <= 0) return 0;
  if (score < 50) return 1;
  if (score < 65) return 2;
  if (score < 80) return 3;
  return 4;
}

function scoreBand(score: number): string {
  return ["invalid", "low", "follow-up", "strong", "high"][scoreBandIndex(score)];
}

function quadraticWeightedKappa(left: number[], right: number[], categoryCount = 5): number {
  if (left.length !== right.length || left.length === 0) return 0;
  const denominator = (categoryCount - 1) ** 2;
  const weights = Array.from({ length: categoryCount }, (_, row) =>
    Array.from({ length: categoryCount }, (_, column) => ((row - column) ** 2) / denominator));
  const leftMarginal = Array.from({ length: categoryCount }, () => 0);
  const rightMarginal = Array.from({ length: categoryCount }, () => 0);
  let observed = 0;
  for (let index = 0; index < left.length; index += 1) {
    observed += weights[left[index]][right[index]];
    leftMarginal[left[index]] += 1;
    rightMarginal[right[index]] += 1;
  }
  observed /= left.length;
  let expected = 0;
  for (let row = 0; row < categoryCount; row += 1) {
    for (let column = 0; column < categoryCount; column += 1) {
      expected += weights[row][column] * (leftMarginal[row] / left.length) * (rightMarginal[column] / left.length);
    }
  }
  return expected === 0 ? (observed === 0 ? 1 : 0) : 1 - observed / expected;
}

if (human.protocolVersion !== benchmark.protocolVersion || human.auditVersion !== benchmark.scoring.blindAudit.auditVersion
  || human.runId !== runId || identityMap.runId !== runId) {
  throw new Error("Human checkpoint, identity map and benchmark do not match");
}
if (human.decisions.length !== 12) throw new Error(`Expected 12 human decisions, found ${human.decisions.length}`);
const identityById = new Map(identityMap.identities.map((identity) => [identity.blindCandidateId, identity]));

const comparisons = human.decisions.map((decision) => {
  const identity = identityById.get(decision.blindCandidateId);
  if (!identity) throw new Error(`Missing deblind identity for ${decision.blindCandidateId}`);
  const model = identity.anchorModelCandidate;
  const commonModelGates = {
    companyExists: model.eligibility.companyExists,
    germanyPresence: model.eligibility.germanyPresence,
    networkingRelevant: model.eligibility.networkingRelevant,
    sufficientEvidence: model.eligibility.sufficientEvidence,
  };
  const commonGateMatches = Object.keys(decision.gates).map((key) => {
    const gate = key as keyof HumanDecision["gates"];
    return { gate, matches: decision.gates[gate] === commonModelGates[gate] };
  });
  const modelScore = model.score;
  const humanScore = allHumanGatesPass(decision) ? candidateScore(decision.levels) : 0;
  const modelCategory: HumanCategory = passesAllGates(model.eligibility) ? identity.anchorChannelId : "none-or-unclear";
  const uniqueOccurrenceChannels = [...new Set(identity.allOccurrences.map((occurrence) => occurrence.channelId))];
  const problemTriggers = [
    ...(uniqueOccurrenceChannels.length > 1 ? ["cross-category-occurrence"] : []),
    ...(model.levels.evidenceReliability <= 1 ? ["evidence-reliability-at-most-1"] : []),
    ...(Math.abs(model.score - 50) <= 5 ? ["score-within-5-of-50"] : []),
  ];
  if (decision.sampleType === "problem" && problemTriggers.length === 0) {
    throw new Error(`Problem sample ${decision.blindCandidateId} has no frozen trigger`);
  }
  return {
    blindCandidateId: decision.blindCandidateId,
    sampleType: decision.sampleType,
    companyName: decision.companyName,
    officialUrl: decision.officialUrl,
    anchor: {
      systemId: identity.anchorSystemId,
      channelId: identity.anchorChannelId,
      rank: identity.anchorRank,
      occurrenceCount: identity.allOccurrences.length,
      occurrenceChannels: uniqueOccurrenceChannels,
    },
    problemTriggers,
    model: {
      gates: commonModelGates,
      submittedChannelRole: model.eligibility.submittedChannelRole,
      uniqueWithinList: model.eligibility.uniqueWithinList,
      validCategory: modelCategory,
      levels: model.levels,
      score: modelScore,
      scoreBand: scoreBand(modelScore),
    },
    human: {
      gates: decision.gates,
      validCategory: decision.validCategory,
      levels: decision.levels,
      score: humanScore,
      scoreBand: scoreBand(humanScore),
      reviewerNotes: decision.reviewerNotes,
    },
    comparison: {
      gateFieldAgreement: Object.fromEntries(commonGateMatches.map(({ gate, matches }) => [gate, matches])),
      allCommonGatesAgree: commonGateMatches.every(({ matches }) => matches),
      categoryAgrees: modelCategory === decision.validCategory,
      scoreDifferenceModelMinusHuman: modelScore - humanScore,
      absoluteScoreError: Math.abs(modelScore - humanScore),
      scoreBandAgrees: scoreBandIndex(modelScore) === scoreBandIndex(humanScore),
    },
  };
});

const core = comparisons.filter((comparison) => comparison.sampleType === "core");
const problem = comparisons.filter((comparison) => comparison.sampleType === "problem");
if (core.length !== 6 || problem.length !== 6) throw new Error(`Expected 6 core and 6 problem comparisons, found ${core.length} and ${problem.length}`);
const gateFieldMatches = core.flatMap((comparison) => Object.values(comparison.comparison.gateFieldAgreement));
const categoryBias = (["tier1-distribution", "b2b-resale", "project-services"] as ChannelId[]).map((channelId) => {
  const rows = core.filter((comparison) => comparison.anchor.channelId === channelId);
  const differences = rows.map((row) => row.comparison.scoreDifferenceModelMinusHuman);
  return {
    channelId,
    auditedCandidates: rows.length,
    modelMinusHumanMeanBias: round(mean(differences)),
    absoluteMeanBias: round(Math.abs(mean(differences))),
  };
});
const metrics = {
  coreSampleSize: core.length,
  gateFieldAgreement: round(gateFieldMatches.filter(Boolean).length / gateFieldMatches.length),
  completeGateVectorAgreement: round(core.filter((comparison) => comparison.comparison.allCommonGatesAgree).length / core.length),
  categoryAgreement: round(core.filter((comparison) => comparison.comparison.categoryAgrees).length / core.length),
  scoreBandExactAgreement: round(core.filter((comparison) => comparison.comparison.scoreBandAgrees).length / core.length),
  quadraticWeightedKappa: round(quadraticWeightedKappa(
    core.map((comparison) => scoreBandIndex(comparison.model.score)),
    core.map((comparison) => scoreBandIndex(comparison.human.score)),
  )),
  scoreMeanAbsoluteError: round(mean(core.map((comparison) => comparison.comparison.absoluteScoreError))),
  overallModelMinusHumanMeanBias: round(mean(core.map((comparison) => comparison.comparison.scoreDifferenceModelMinusHuman))),
  categoryBias,
};

const thresholds = benchmark.scoring.blindAudit.acceptance;
const failedThresholds = [
  ...(metrics.gateFieldAgreement < thresholds.gateAgreementMinimum ? ["gateAgreement"] : []),
  ...(metrics.categoryAgreement < thresholds.categoryAgreementMinimum ? ["categoryAgreement"] : []),
  ...(metrics.quadraticWeightedKappa < thresholds.weightedKappaMinimum ? ["weightedKappa"] : []),
  ...(metrics.scoreMeanAbsoluteError > thresholds.scoreMeanAbsoluteErrorMaximum ? ["scoreMeanAbsoluteError"] : []),
  ...(metrics.categoryBias.some((row) => row.absoluteMeanBias > thresholds.absoluteCategoryMeanBiasMaximum)
    ? ["absoluteCategoryMeanBias"] : []),
];
const gateOrCategoryFailure = failedThresholds.includes("gateAgreement") || failedThresholds.includes("categoryAgreement");
const calibrationDecision = gateOrCategoryFailure
  ? {
    status: "failed-gate-or-category-calibration",
    rawScoresChanged: false,
    leaderboardStatus: "provisional-not-calibrated",
    requiredAction: "revise rubric, expand human audit, and rescore the full candidate pool; a numeric offset is prohibited",
  }
  : failedThresholds.length
    ? {
      status: "numeric-calibration-review-required",
      rawScoresChanged: false,
      leaderboardStatus: "provisional-pending-uniform-category-correction",
      requiredAction: "review one uniform per-category correction capped at plus or minus 8; provider-specific correction is prohibited",
    }
    : {
      status: "accepted-with-focused-spot-check-uncertainty",
      rawScoresChanged: false,
      leaderboardStatus: "accepted",
      requiredAction: "retain raw scores and report the observed six-case error distribution as limited uncertainty evidence",
    };

const result = {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  auditVersion: benchmark.scoring.blindAudit.auditVersion,
  runId,
  humanAuditCheckpointCommit: "67fff9a",
  humanDecisionsFrozenBeforeDeblinding: true,
  thresholds,
  metricDefinitions: {
    gateAgreement: "field-level agreement over companyExists, germanyPresence, networkingRelevant and sufficientEvidence; model-only role and uniqueness gates are excluded",
    categoryAgreement: "exact agreement between the model's eligible anchor channel (or none) and the human valid category",
    weightedKappa: "quadratic weighted kappa over invalid, low, follow-up, strong and high total-score bands",
    scoreError: "model anchor score versus human score after each side's gates are applied",
    representativeStatistics: "six core samples only; six problem samples are diagnostic and excluded",
  },
  metrics,
  passed: failedThresholds.length === 0,
  failedThresholds,
  calibrationDecision,
  coreComparisons: core,
  problemDiagnostics: problem,
};
const output = path.join(artifactRoot, "scoring/human-audit-comparison.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
const postAuditLeaderboard = {
  schemaVersion: 1,
  protocolVersion: benchmark.protocolVersion,
  auditVersion: benchmark.scoring.blindAudit.auditVersion,
  runId,
  status: calibrationDecision.leaderboardStatus,
  rankingMetric: rawLeaderboard.rankingMetric,
  scoresAreRawAndUnchanged: true,
  finalWinnerDeclared: false,
  failedThresholds,
  calibrationDecision,
  leaderboard: rawLeaderboard.leaderboard,
};
const leaderboardOutput = path.join(artifactRoot, "scoring/leaderboard-post-human-audit.json");
await writeFile(leaderboardOutput, `${JSON.stringify(postAuditLeaderboard, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: path.relative(path.resolve("."), output).replaceAll("\\", "/"),
  leaderboardOutput: path.relative(path.resolve("."), leaderboardOutput).replaceAll("\\", "/"),
  metrics,
  failedThresholds,
  calibrationDecision,
  problemTriggers: problem.map((row) => ({ companyName: row.companyName, triggers: row.problemTriggers })),
}, null, 2));
