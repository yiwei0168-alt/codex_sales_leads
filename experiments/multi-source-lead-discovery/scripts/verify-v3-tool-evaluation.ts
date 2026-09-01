import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v3-tools-frozen-v2/role-aware-v3");
const [scores, analysis, report] = await Promise.all([
  readFile(path.join(root, "tool-company-scores.v3.0.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "tool-evaluation-analysis.v3.0.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "tool-search-evaluation-report.v3.0.md"), "utf8"),
]);
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
assert(scores.candidates.length === 207, "Expected 207 company scores");
assert(analysis.coverage.systemOccurrences === 253, "Expected 253 system occurrences");
assert(analysis.coverage.uniqueCompanies === 207, "Expected 207 unique companies");
assert(analysis.systems.length === 8, "Expected eight tools");
assert(Object.values(scores.restrictions).every((value) => value === 0), "A prohibited acquisition or downstream stage ran");
assert(scores.candidates.every((item: { totalScore: number; dimensions: Record<string, { score: number }> }) =>
  item.totalScore === Object.values(item.dimensions).reduce((sum, dimension) => sum + dimension.score, 0)),
"A model-provided total bypassed deterministic calculation");
assert(scores.candidates.every((item: Record<string, unknown>) => !("cooperationPaths" in item)
  && !("selectedPathId" in item) && !("developmentStrategy" in item)), "Forbidden downstream fields found");
assert(analysis.quality.publishedEvidenceReferenceValidPercent === 100, "Invalid published evidence reference detected");
assert(analysis.systems.every((system: { rank: number }, index: number) => system.rank === index + 1), "Rank mismatch");
assert(report.includes("本轮新增搜索/证据：0 / 0"), "Report does not disclose frozen-input restriction");
console.log(JSON.stringify({ passed: true, companies: scores.candidates.length,
  occurrences: analysis.coverage.systemOccurrences, tools: analysis.systems.length,
  restrictions: scores.restrictions,
  publishedEvidenceReferenceValidPercent: analysis.quality.publishedEvidenceReferenceValidPercent,
  rawModelEvidenceReferenceConformancePercent: analysis.quality.rawModelEvidenceReferenceConformancePercent }, null, 2));
