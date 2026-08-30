import { readFile } from "node:fs/promises";
import path from "node:path";

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9)
  ?? "2026-08-30-de-v2-tools-full";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId,
  "role-aware-v2/scoring/role-aware-lead-value-v2.0");
const leaderboard = JSON.parse(await readFile(path.join(root, "leaderboard-tool-lead-value.v2.0.json"), "utf8")) as {
  coverage: { systemOccurrences: number; uniqueCompanies: number; assessedCompanies: number; oldEvidenceUsedForScoring: number };
  systems: Array<{ rank: number; systemId: string; macroMeanPerTargetSlot: number;
    channels: Array<{ selectedCount: number; missingTargetSlots: number; meanPerTargetSlot: number;
      selected: Array<{ dossierId: string; mainRole: string; leadValueScore: number; eligibleForLeaderboard: boolean }> }> }>;
};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
assert(leaderboard.coverage.systemOccurrences === 253, "Expected all 253 canonical system occurrences");
assert(leaderboard.coverage.uniqueCompanies === 207, "Expected all 207 unique companies");
assert(leaderboard.coverage.assessedCompanies === 207, "Expected 207 v2 assessments");
assert(leaderboard.coverage.oldEvidenceUsedForScoring === 0, "Old evidence was used for scoring");
assert(leaderboard.systems.length === 8, "Expected eight measured systems");
for (const [index, system] of leaderboard.systems.entries()) {
  assert(system.rank === index + 1, `Rank mismatch for ${system.systemId}`);
  assert(system.channels.length === 3, `Lane count mismatch for ${system.systemId}`);
  assert(index === 0 || leaderboard.systems[index - 1].macroMeanPerTargetSlot >= system.macroMeanPerTargetSlot,
    "Leaderboard is not sorted");
  for (const channel of system.channels) {
    assert(channel.selectedCount + channel.missingTargetSlots === 10, "Fixed-slot accounting mismatch");
    assert(channel.selected.length === channel.selectedCount && channel.selectedCount <= 10, "Selection count mismatch");
    assert(channel.selected.every((candidate) => candidate.eligibleForLeaderboard), "Leaderboard-excluded candidate selected");
    assert(channel.selected.every((candidate, selectedIndex) => selectedIndex === 0
      || channel.selected[selectedIndex - 1].leadValueScore >= candidate.leadValueScore), "Candidates not score-sorted");
  }
}
console.log(JSON.stringify({ runId, verifiedSystems: leaderboard.systems.length,
  coverage: leaderboard.coverage, leaderboard: leaderboard.systems.map((item) => ({ rank: item.rank,
    systemId: item.systemId, score: item.macroMeanPerTargetSlot })) }, null, 2));
