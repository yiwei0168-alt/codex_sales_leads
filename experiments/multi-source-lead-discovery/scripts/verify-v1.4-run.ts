import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SharedDossierArtifact } from "../lib/evidence-dossier";
import {
  independentDecisionKey,
  scoreIndependentLevels,
  validateIndependentDecisions,
  type IndependentDecisionArtifact,
  type V14OccurrenceScore,
} from "../lib/v1.4-independent-value";

interface ScoreArtifact {
  status: string;
  policy: {
    provider_evidence_completeness: { mainScoreWeight: number; isTruthMetric: boolean };
    humanAuditRule: string;
  };
  summary: {
    occurrenceCount: number;
    independentDecisionCount: number;
    unresolvedDecisionCount: number;
  };
  scores: V14OccurrenceScore[];
}

interface LeaderboardArtifact {
  status: string;
  policy: ScoreArtifact["policy"];
  systems: Array<{
    rank: number;
    systemId: string;
    macroMeanPerTargetSlot: number;
    provider_evidence_completeness: { percentage: number; mainScoreWeight: number };
    channels: Array<{
      channelId: string;
      meanPerTargetSlot: number;
      top10ScoreSum: number;
      selected: Array<V14OccurrenceScore & { finalRank: number }>;
    }>;
  }>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId);
const master = JSON.parse(await readFile(path.join(runRoot, "evidence/shared-evidence-dossiers.v1.json"), "utf8")) as SharedDossierArtifact;
const decisions = JSON.parse(await readFile(path.join(runRoot, "evaluation/v1.4/gemini-full-independent-decisions.json"), "utf8")) as IndependentDecisionArtifact;
const scoreArtifact = JSON.parse(await readFile(path.join(runRoot, "scoring/independent-value-v1.4/all-candidate-scores.v1.4.json"), "utf8")) as ScoreArtifact;
const leaderboard = JSON.parse(await readFile(path.join(runRoot, "scoring/independent-value-v1.4/leaderboard-independent-value.v1.4.json"), "utf8")) as LeaderboardArtifact;

validateIndependentDecisions({ artifact: decisions, dossiers: master.companies });
assert(decisions.decisions.length === 30, `Expected 30 Gemini Full decisions, received ${decisions.decisions.length}`);
assert(decisions.decisions.filter((decision) => decision.status === "verified-pass").length === 24, "Expected 24 verified-pass decisions");
assert(decisions.decisions.filter((decision) => decision.status === "verified-fail").length === 6, "Expected 6 verified-fail decisions");
assert(decisions.decisions.every((decision) => decision.status !== "unresolved"), "Unresolved decision present");
for (const lane of ["tier1-distribution", "b2b-resale", "project-services"] as const) {
  assert(decisions.decisions.filter((decision) => decision.channelId === lane).length === 10, `Expected 10 decisions for ${lane}`);
}

assert(scoreArtifact.status === "final-no-new-human-audit", "Unexpected score-artifact status");
assert(scoreArtifact.summary.occurrenceCount === 555 && scoreArtifact.scores.length === 555, "v1.4 must contain all 555 occurrences");
assert(scoreArtifact.summary.independentDecisionCount === 30, "Decision summary mismatch");
assert(scoreArtifact.summary.unresolvedDecisionCount === 0, "Unresolved summary must be zero");
assert(scoreArtifact.policy.provider_evidence_completeness.mainScoreWeight === 0, "Provider completeness must have zero score weight");
assert(scoreArtifact.policy.provider_evidence_completeness.isTruthMetric === false, "Provider completeness must not be a truth metric");
assert(scoreArtifact.policy.humanAuditRule.startsWith("No new blind audit"), "v1.4 must record the no-new-audit decision");

const decisionByKey = new Map(decisions.decisions.map((decision) => [independentDecisionKey(decision.dossierId, decision.channelId), decision]));
for (const score of scoreArtifact.scores) {
  const decision = decisionByKey.get(independentDecisionKey(score.dossierId, score.channelId));
  if (decision) {
    assert(score.evaluationBasis === "v1.4-independent-adjudication", `Decision was not shared to ${score.systemId}/${score.dossierId}/${score.channelId}`);
    assert(score.independentDecisionStatus === decision.status, "Decision status mismatch");
    const expected = decision.status === "verified-pass" ? scoreIndependentLevels(decision.levels) : 0;
    assert(score.score === expected, `Independent score mismatch for ${score.dossierId}/${score.channelId}`);
  }
}

const geminiScores = scoreArtifact.scores.filter((score) => score.systemId === "gemini-full");
assert(geminiScores.length === 30, `Expected 30 Gemini Full scores, received ${geminiScores.length}`);
assert(geminiScores.every((score) => score.evaluationBasis === "v1.4-independent-adjudication"), "Every Gemini Full row must be independently adjudicated");
assert(geminiScores.filter((score) => score.score > 0).length === 24, "Expected 24 positive Gemini Full scores");

for (const system of leaderboard.systems) {
  assert(system.provider_evidence_completeness.mainScoreWeight === 0, `Completeness weight changed for ${system.systemId}`);
  const macro = Number((system.channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0) / 3).toFixed(2));
  assert(system.macroMeanPerTargetSlot === macro, `Macro mismatch for ${system.systemId}`);
  for (const channel of system.channels) {
    const sum = channel.selected.reduce((total, score) => total + score.score, 0);
    assert(sum === channel.top10ScoreSum, `Top-ten sum mismatch for ${system.systemId}/${channel.channelId}`);
    assert(channel.meanPerTargetSlot === Number((sum / 10).toFixed(2)), `Channel mean mismatch for ${system.systemId}/${channel.channelId}`);
  }
}
const sorted = [...leaderboard.systems].sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot
  || left.systemId.localeCompare(right.systemId));
assert(sorted.every((system, index) => system.systemId === leaderboard.systems[index]?.systemId && system.rank === index + 1), "Leaderboard ordering mismatch");
const gemini = leaderboard.systems.find((system) => system.systemId === "gemini-full");
assert(gemini?.rank === 1 && gemini.macroMeanPerTargetSlot === 64.93, "Gemini Full v1.4 regression value changed");

console.log(JSON.stringify({
  runId,
  verified: true,
  occurrenceCount: scoreArtifact.scores.length,
  decisions: { total: 30, pass: 24, fail: 6, unresolved: 0 },
  providerEvidenceCompletenessWeight: 0,
  newHumanAudit: false,
  geminiFull: { rank: gemini.rank, macroMeanPerTargetSlot: gemini.macroMeanPerTargetSlot },
}, null, 2));
