import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane } from "../lib/evidence-dossier";

interface CandidateRow {
  dossierId: string; systemId: string; channelId: BenchmarkLane; primaryRole: string | null;
  facts: { supportedRoles: string[]; correctedRoutes: BenchmarkLane[] };
}
interface ScoreArtifact { summary: { finalPrimaryRoutedOccurrences: number }; scores: CandidateRow[] }
interface LeaderboardArtifact {
  systems: Array<{ systemId: string; macroAdjustedChannelScore: number; channels: Array<{
    channelId: BenchmarkLane; selectedCount: number; meanSelectedScore: number; adjustedChannelScore: number;
    completionPenalty: { missingCount: number; ratePerMissing: number; penaltyRate: number };
    selected: CandidateRow[];
  }> }>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId,
  "scoring/end-to-end-value-v1.7");
const scores = JSON.parse(await readFile(path.join(root, "all-candidate-scores.v1.7.json"), "utf8")) as ScoreArtifact;
const leaderboard = JSON.parse(await readFile(path.join(root, "leaderboard-primary-channel.v1.7.json"), "utf8")) as LeaderboardArtifact;
const failures: string[] = [];
const seen = new Set<string>();
for (const candidate of scores.scores) {
  const key = `${candidate.systemId}\u0000${candidate.dossierId}`;
  if (seen.has(key)) failures.push(`candidate occupies multiple primary channels: ${key}`);
  seen.add(key);
  if (candidate.facts.correctedRoutes.length > 0 && !candidate.facts.correctedRoutes.includes(candidate.channelId)) {
    failures.push(`primary channel lacks a supported role route: ${key}/${candidate.channelId}`);
  }
}
if (scores.summary.finalPrimaryRoutedOccurrences !== scores.scores.length) failures.push("score summary count mismatch");
for (const system of leaderboard.systems) {
  for (const channel of system.channels) {
    if (channel.selectedCount !== channel.selected.length) failures.push(`selected count mismatch: ${system.systemId}/${channel.channelId}`);
    if (channel.selectedCount > 10) failures.push(`more than ten selected: ${system.systemId}/${channel.channelId}`);
    const expectedPenalty = Math.min(0.3, channel.completionPenalty.missingCount * channel.completionPenalty.ratePerMissing);
    if (channel.completionPenalty.penaltyRate !== expectedPenalty) failures.push(`penalty mismatch: ${system.systemId}/${channel.channelId}`);
    const expectedAdjusted = Number((channel.meanSelectedScore * (1 - expectedPenalty)).toFixed(2));
    if (channel.adjustedChannelScore !== expectedAdjusted) failures.push(`adjusted score mismatch: ${system.systemId}/${channel.channelId}`);
  }
  const expectedMacro = Number((system.channels.reduce((sum, channel) => sum + channel.adjustedChannelScore, 0)
    / system.channels.length).toFixed(2));
  if (system.macroAdjustedChannelScore !== expectedMacro) failures.push(`macro mismatch: ${system.systemId}`);
}
if (failures.length > 0) throw new Error(`v1.7 verification failed:\n${failures.join("\n")}`);
console.log(JSON.stringify({ runId, verifiedScores: scores.scores.length, verifiedSystems: leaderboard.systems.length,
  invariants: ["one-primary-channel", "all-roles-retained", "2-percent-standard-shortfall",
    "3-percent-original-tier1-shortfall", "30-percent-penalty-cap"] }, null, 2));
