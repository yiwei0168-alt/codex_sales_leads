import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane } from "../lib/evidence-dossier";
import type { V16UnifiedScore } from "../lib/v1.6-unified-rescoring";

interface ScoreArtifact {
  summary: { finalRoutedOccurrences: number };
  scores: V16UnifiedScore[];
}
interface LeaderboardArtifact {
  systems: Array<{
    systemId: string;
    macroMeanPerTargetSlot: number;
    channels: Array<{
      channelId: BenchmarkLane;
      meanPerTargetSlot: number;
      selected: Array<V16UnifiedScore & { finalRank: number }>;
    }>;
  }>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId,
  "scoring/end-to-end-value-v1.6");
const scores = JSON.parse(await readFile(path.join(root, "all-candidate-scores.v1.6.json"), "utf8")) as ScoreArtifact;
const leaderboard = JSON.parse(await readFile(path.join(root, "leaderboard-end-to-end-value.v1.6.json"), "utf8")) as LeaderboardArtifact;
const failures: string[] = [];
const seen = new Set<string>();

for (const row of scores.scores) {
  const key = `${row.systemId}\u0000${row.dossierId}\u0000${row.channelId}`;
  if (seen.has(key)) failures.push(`duplicate corrected occurrence: ${key}`);
  seen.add(key);
  if (row.facts.correctedRoutes.length > 0 && !row.facts.correctedRoutes.includes(row.channelId)) {
    failures.push(`uncorrected route retained despite supported roles: ${key}`);
  }
  if (row.cooperationPathRoute !== row.channelId) failures.push(`cooperation path scored for another route: ${key}`);
  const expectedComponents = {
    productUseCaseFit: Number((row.levels.productUseCaseFit * 8.8).toFixed(2)),
    cooperationPath: Number((row.levels.cooperationPath * 6.4).toFixed(2)),
    independentInformationConfidence: Number((row.levels.independentInformationConfidence * 4).toFixed(2)),
    roleIdentificationQuality: row.facts.supportedRoles.length > 0 ? 3 : 0,
    channelClassificationQuality: row.facts.correctedRoutes.includes(row.channelId) ? 1 : 0,
  };
  if (JSON.stringify(row.scoreComponents) !== JSON.stringify(expectedComponents)) failures.push(`component mismatch: ${key}`);
  const expectedScore = row.failedHardValueGates.length > 0 ? 0
    : Number((Object.values(expectedComponents).reduce((sum, value) => sum + value, 0)).toFixed(2));
  if (row.score !== expectedScore) failures.push(`total mismatch: ${key}`);
}

if (scores.summary.finalRoutedOccurrences !== scores.scores.length) failures.push("summary occurrence count mismatch");
for (const system of leaderboard.systems) {
  for (const channel of system.channels) {
    if (channel.selected.length > 10) failures.push(`more than ten selected: ${system.systemId}/${channel.channelId}`);
    channel.selected.forEach((row, index) => {
      if (row.finalRank !== index + 1) failures.push(`rank sequence mismatch: ${system.systemId}/${channel.channelId}`);
      if (row.systemId !== system.systemId || row.channelId !== channel.channelId) {
        failures.push(`selected occurrence is in the wrong system/channel: ${system.systemId}/${channel.channelId}`);
      }
    });
  }
  const expectedMacro = Number((system.channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0)
    / system.channels.length).toFixed(2));
  if (system.macroMeanPerTargetSlot !== expectedMacro) failures.push(`macro mismatch: ${system.systemId}`);
}

if (failures.length > 0) throw new Error(`v1.6 verification failed:\n${failures.join("\n")}`);
console.log(JSON.stringify({ runId, verifiedScores: scores.scores.length, verifiedSystems: leaderboard.systems.length,
  invariants: ["corrected-route-only", "route-specific-cooperation-path", "44/32/20/3/1", "hard-gate-zero", "top10-ranking"] }, null, 2));
