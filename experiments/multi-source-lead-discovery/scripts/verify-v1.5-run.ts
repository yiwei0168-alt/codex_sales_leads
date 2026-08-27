import { readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery");
const scoringRoot = path.join(root, "artifacts/runs", runId, "scoring/end-to-end-value-v1.5");
const scores = JSON.parse(await readFile(path.join(scoringRoot, "all-candidate-scores.v1.5.json"), "utf8")) as {
  policy: { hardValueGates: string[]; removedHardGates: string[]; weights: Record<string, number>; outputClassificationShare: number };
  summary: Record<string, number>; scores: Array<{ score: number; failedHardValueGates: string[] }> };
const leaderboard = JSON.parse(await readFile(path.join(scoringRoot, "leaderboard-end-to-end-value.v1.5.json"), "utf8")) as {
  systems: Array<{ rank: number; systemId: string; macroMeanPerTargetSlot: number }> };
const report = await readFile(path.join(root, "reports/v1.5-end-to-end-correction-final-report.md"), "utf8");
assert(JSON.stringify(scores.policy.hardValueGates) === JSON.stringify(["companyExists", "germanyPresence", "activeNetworking"]), "Hard value gates changed");
assert(scores.policy.removedHardGates.includes("submittedLaneMembership"), "Lane membership is still a hard gate");
assert(scores.policy.removedHardGates.includes("uniqueCanonicalCompany"), "Deduplication is still a candidate-value gate");
assert(scores.policy.outputClassificationShare === 4, "Role/channel classification must remain 4% of the score");
const { maximum, ...dimensionWeights } = scores.policy.weights;
assert(Object.values(dimensionWeights).reduce((sum, value) => sum + value, 0) === maximum,
  "Dimension weights must total the declared maximum");
assert(scores.scores.length === scores.summary.finalRoutedOccurrences, "Score occurrence summary mismatch");
assert(scores.scores.every((row) => row.score === 0 || row.failedHardValueGates.length === 0), "A failed hard-gate row received value");
assert(leaderboard.systems[0]?.systemId === "gemini-full", "Expected Gemini Full to remain first in this frozen rescore");
assert(leaderboard.systems[1]?.systemId === "product-google-places-local", "Expected Google Places Local to rank second");
assert(leaderboard.systems[0].macroMeanPerTargetSlot - leaderboard.systems[1].macroMeanPerTargetSlot < 3, "Top-two gap regression");
const disclosed = report.match(/^\| DOS-[A-F0-9]+ \|/gm)?.length ?? 0;
assert(disclosed === scores.scores.length, `Report discloses ${disclosed}/${scores.scores.length} rows`);
console.log(JSON.stringify({ runId, verified: true, rows: scores.scores.length, disclosed,
  rescuedFromOriginalZero: scores.summary.rescuedFromOriginalZero,
  leaderboard: leaderboard.systems.map((system) => ({ rank: system.rank, systemId: system.systemId,
    score: system.macroMeanPerTargetSlot })) }, null, 2));
