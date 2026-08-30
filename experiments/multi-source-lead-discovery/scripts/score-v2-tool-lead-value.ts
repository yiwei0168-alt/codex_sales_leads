import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Role = "Distributor" | "VAD" | "VAR" | "Dealer" | "Reseller" | "Retailer" | "E-tailer"
  | "SI" | "Installer" | "MSP" | "ISP" | "Hybrid" | "Unresolved";
type Lane = "tier1-distribution" | "b2b-resale" | "project-services";

interface OldCandidate {
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  submittedRank: number;
  sourceChannelIds?: string[];
  channelId: string;
}
interface OldLeaderboard {
  systems: Array<{ systemId: string; channels: Array<{ channelId: string; candidates: OldCandidate[] }> }>;
}
interface V2Comparison {
  dossierId: string;
  companyName: string;
  domain: string;
  newV2Score: number;
  primaryBusinessRole: Role;
  supportedRoles: Role[];
  eligibilityStatus: string;
  researchDepth: string;
  companyScaleClass: string;
  confidence: number;
  selectedPathId: string | null;
  cooperationPaths: Array<{ pathId: string; candidateRole: Role }>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9)
  ?? "2026-08-30-de-v2-tools-full";
const artifactRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs");
const oldRoot = path.join(artifactRoot, "2026-08-27-de-v1.3/scoring/end-to-end-value-v1.7");
const runRoot = path.join(artifactRoot, runId, "role-aware-v2");
const scoringRoot = path.join(runRoot, "scoring/role-aware-lead-value-v2.0");
const [oldLeaderboard, result] = await Promise.all([
  readFile(path.join(oldRoot, "leaderboard-primary-channel.v1.7.json"), "utf8")
    .then((value) => JSON.parse(value) as OldLeaderboard),
  readFile(path.join(runRoot, "assessment-results.json"), "utf8")
    .then((value) => JSON.parse(value) as { comparisons: V2Comparison[]; freshnessAudit: {
      oldEvidenceUsedForScoring: number } }),
]);
if (result.freshnessAudit.oldEvidenceUsedForScoring !== 0) {
  throw new Error("v2 tool leaderboard cannot use a run with old scoring evidence");
}
const comparisonByDossier = new Map(result.comparisons.map((item) => [item.dossierId, item]));

function resolvedPrimaryRole(comparison: V2Comparison): Role {
  if (!["Hybrid", "Unresolved"].includes(comparison.primaryBusinessRole)) return comparison.primaryBusinessRole;
  const selectedPathRole = comparison.cooperationPaths.find((item) =>
    item.pathId === comparison.selectedPathId)?.candidateRole;
  return selectedPathRole ?? comparison.supportedRoles[0] ?? comparison.primaryBusinessRole;
}

function laneFor(role: Role): Lane | null {
  if (["Distributor", "VAD"].includes(role)) return "tier1-distribution";
  if (["VAR", "Dealer", "Reseller", "Retailer", "E-tailer"].includes(role)) return "b2b-resale";
  if (["SI", "Installer", "MSP", "ISP"].includes(role)) return "project-services";
  return null;
}

const lanes: Lane[] = ["tier1-distribution", "b2b-resale", "project-services"];
const candidateScores: Array<{
  systemId: string;
  dossierId: string;
  companyName: string;
  officialUrl: string | null;
  originalChannelId: string;
  mainRole: Role;
  scoringLane: Lane | null;
  leadValueScore: number;
  eligibilityStatus: string;
  eligibleForLeaderboard: boolean;
  submittedRank: number;
  researchDepth: string;
  companyScaleClass: string;
  confidence: number;
}> = [];
for (const system of oldLeaderboard.systems) {
  const byDossier = new Map<string, OldCandidate>();
  for (const channel of system.channels) {
    for (const candidate of channel.candidates) {
      const existing = byDossier.get(candidate.dossierId);
      if (!existing || candidate.submittedRank < existing.submittedRank) byDossier.set(candidate.dossierId, candidate);
    }
  }
  for (const candidate of byDossier.values()) {
    const comparison = comparisonByDossier.get(candidate.dossierId);
    if (!comparison) throw new Error(`Missing v2 assessment for ${candidate.dossierId} (${candidate.companyName})`);
    const mainRole = resolvedPrimaryRole(comparison);
    const scoringLane = laneFor(mainRole);
    candidateScores.push({ systemId: system.systemId, dossierId: candidate.dossierId,
      companyName: comparison.companyName, officialUrl: candidate.officialUrl,
      originalChannelId: candidate.channelId, mainRole, scoringLane,
      leadValueScore: comparison.newV2Score, eligibilityStatus: comparison.eligibilityStatus,
      eligibleForLeaderboard: !comparison.eligibilityStatus.startsWith("ineligible") && scoringLane !== null,
      submittedRank: candidate.submittedRank, researchDepth: comparison.researchDepth,
      companyScaleClass: comparison.companyScaleClass, confidence: comparison.confidence });
  }
}

const systems = oldLeaderboard.systems.map((system) => {
  const systemCandidates = candidateScores.filter((candidate) => candidate.systemId === system.systemId);
  const channels = lanes.map((lane) => {
    const routed = systemCandidates.filter((candidate) => candidate.scoringLane === lane);
    const eligible = routed.filter((candidate) => candidate.eligibleForLeaderboard)
      .sort((left, right) => right.leadValueScore - left.leadValueScore
        || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
    const selected = eligible.slice(0, 10).map((candidate, index) => ({ ...candidate, finalRank: index + 1 }));
    const meanPerTargetSlot = Number((selected.reduce((sum, candidate) => sum + candidate.leadValueScore, 0) / 10).toFixed(2));
    return { channelId: lane, routedCandidates: routed.length, eligibleCandidates: eligible.length,
      selectedCount: selected.length, missingTargetSlots: 10 - selected.length, meanPerTargetSlot, selected };
  });
  return { systemId: system.systemId, channels,
    macroMeanPerTargetSlot: Number((channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0)
      / channels.length).toFixed(2)) };
}).sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot
  || left.systemId.localeCompare(right.systemId)).map((system, index) => ({ ...system, rank: index + 1 }));

const generatedAt = new Date().toISOString();
const policy = {
  version: "role-aware-tool-lead-value-v2.0",
  objective: "Compare discovery result quality only, not provider cost, latency or cooperation-path verbosity.",
  candidatePool: "All 207 unique companies / 253 system occurrences routed in v1.7, including old hard-gate and below-Top-10 rows.",
  roleRule: "Each company is placed in one main-role lane. Hybrid/Unresolved uses the already-selected path role only as a tie-breaker, without new path analysis.",
  valueRule: "Use the final evidence-grounded v2 total lead-value score once per canonical company; do not rescore the same company per tool.",
  eligibilityRule: "Completed leads with eligible or research-required status can occupy a search-quality leaderboard slot; ineligible leads cannot.",
  completionRule: "Each lane has ten fixed slots; missing slots contribute zero.",
  laneMap: { "tier1-distribution": ["Distributor", "VAD"],
    "b2b-resale": ["VAR", "Dealer", "Reseller", "Retailer", "E-tailer"],
    "project-services": ["SI", "Installer", "MSP", "ISP"] },
};
await mkdir(scoringRoot, { recursive: true });
await writeFile(path.join(scoringRoot, "all-candidate-tool-scores.v2.0.json"), `${JSON.stringify({
  schemaVersion: 1, runId, generatedAt, policy, candidates: candidateScores,
}, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "leaderboard-tool-lead-value.v2.0.json"), `${JSON.stringify({
  schemaVersion: 1, runId, generatedAt, policy, coverage: {
    systemOccurrences: candidateScores.length,
    uniqueCompanies: new Set(candidateScores.map((item) => item.dossierId)).size,
    assessedCompanies: result.comparisons.length,
    oldEvidenceUsedForScoring: result.freshnessAudit.oldEvidenceUsedForScoring,
  }, systems,
}, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "leaderboard-tool-lead-value.v2.0.md"), [
  "# 多源搜索工具排行榜 v2.0：主角色内线索价值",
  "",
  `Run: ${runId}`,
  "",
  "本榜只比较工具找到的公司是否是有价值的销售线索。每家公司只使用一次 v2 新鲜证据评分并放入一个主角色通道；不比较工具成本、延迟或合作路径文本复杂度。",
  "",
  "| 排名 | 工具 | 总分 | 一级分销 | 转售/零售 | 项目服务 |",
  "|---:|---|---:|---:|---:|---:|",
  ...systems.map((system) => `| ${system.rank} | ${system.systemId} | ${system.macroMeanPerTargetSlot} | ${system.channels[0].meanPerTargetSlot} | ${system.channels[1].meanPerTargetSlot} | ${system.channels[2].meanPerTargetSlot} |`),
  "",
  "## 口径",
  "",
  `- 系统候选记录：${candidateScores.length}`,
  `- 唯一公司：${new Set(candidateScores.map((item) => item.dossierId)).size}`,
  `- 完成 v2 评估的公司：${result.comparisons.length}`,
  "- 每通道固定 10 个槽位，缺失结果按 0 分计入。",
  "- eligible 与 research-required 可按线索价值占榜单槽位；明确不适用于当前任务的公司不能占位，但保留在全量明细中。",
  "",
].join("\n"), "utf8");
console.log(JSON.stringify({ runId, scoringRoot, systems: systems.map((item) => ({ rank: item.rank,
  systemId: item.systemId, score: item.macroMeanPerTargetSlot })), candidates: candidateScores.length }, null, 2));
