import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane, SharedEvidenceDossier } from "../lib/evidence-dossier";
import { evaluateV16Candidate, type V16UnifiedScore } from "../lib/v1.6-unified-rescoring";
import { channelCompletionPenalty, correctV17Roles, primaryRouteForV17 } from "../lib/v1.7-primary-channel";

interface MasterArtifact { policyVersion: string; companies: SharedEvidenceDossier[] }
interface V15Row {
  dossierId: string; systemId: string; channelId: BenchmarkLane; submittedRank: number; score: number;
  levels: { productUseCaseFit: number; cooperationPath: number; independentInformationConfidence: number };
}
interface V15Artifact { scores: V15Row[] }
interface PriorLeaderboard { systems: Array<{ systemId: string; rank: number; macroMeanPerTargetSlot: number }> }
interface IndependentArtifact {
  decisions: Array<{ dossierId: string; valueGates: {
    companyExists: boolean; germanyPresence: boolean; activeNetworking: boolean;
  }; evidence: Array<{ url: string; supports: string[] }> }>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const experimentRoot = path.resolve("experiments/multi-source-lead-discovery");
const runRoot = path.join(experimentRoot, "artifacts/runs", runId);
const scoringRoot = path.join(runRoot, "scoring/end-to-end-value-v1.7");
const reportPath = path.join(experimentRoot, "reports/v1.7-primary-channel-report.md");
const masterPath = path.join(runRoot, "evidence/shared-evidence-dossiers.v1.json");
const v15Path = path.join(runRoot, "scoring/end-to-end-value-v1.5/all-candidate-scores.v1.5.json");
const priorPath = path.join(runRoot, "scoring/end-to-end-value-v1.6/leaderboard-end-to-end-value.v1.6.json");
const independentPath = path.join(runRoot, "evaluation/v1.4/gemini-full-independent-decisions.json");
const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];

const master = JSON.parse(await readFile(masterPath, "utf8")) as MasterArtifact;
const v15 = JSON.parse(await readFile(v15Path, "utf8")) as V15Artifact;
const prior = JSON.parse(await readFile(priorPath, "utf8")) as PriorLeaderboard;
const independent = JSON.parse(await readFile(independentPath, "utf8")) as IndependentArtifact;
const dossierById = new Map(master.companies.map((item) => [item.dossierId, item]));
const independentByDossier = new Map(independent.decisions.map((item) => [item.dossierId, item]));
for (const decision of independent.decisions) {
  const dossier = dossierById.get(decision.dossierId);
  if (!dossier) continue;
  for (const evidence of decision.evidence) {
    const normalizedUrl = evidence.url.replace(/\/$/, "");
    if (dossier.evidence.some((item) => item.url.replace(/\/$/, "") === normalizedUrl)) continue;
    dossier.evidence.push({
      evidenceId: `V14-${decision.dossierId}-${dossier.evidence.length + 1}`,
      url: evidence.url,
      excerpt: evidence.supports.join(" "),
      sourceType: "independent-public",
      acquisition: "fallback-search",
      capturedAt: null,
      sourceSystems: [],
    });
  }
}

const grouped = new Map<string, V15Row[]>();
for (const row of v15.scores) {
  const key = `${row.systemId}\u0000${row.dossierId}`;
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

type V17Row = V16UnifiedScore & {
  primaryRole: string | null;
  primaryChannelReason: string;
  allSupportedRoutes: BenchmarkLane[];
  usedSmallLongTailChannelException: boolean;
};
const scores: V17Row[] = [];
const routeAudit: Array<{
  systemId: string; dossierId: string; companyName: string; sourceChannelIds: BenchmarkLane[];
  primaryRoute: BenchmarkLane | null; primaryRole: string | null; roles: string[]; consensusRoles: string[];
  smallLongTailException: boolean;
}> = [];
let duplicateOccurrencesSuppressed = 0;
for (const rows of grouped.values()) {
  const dossier = dossierById.get(rows[0].dossierId);
  if (!dossier) throw new Error(`Missing dossier ${rows[0].dossierId}`);
  duplicateOccurrencesSuppressed += Math.max(0, rows.length - 1);
  const sourceChannelIds = [...new Set(rows.map((row) => row.channelId))];
  const correction = correctV17Roles(dossier);
  const primaryRoute = primaryRouteForV17(correction, sourceChannelIds,
    dossier.evidenceProfileAssessment.exceptionEligible);
  routeAudit.push({
    systemId: rows[0].systemId, dossierId: dossier.dossierId, companyName: dossier.canonicalName,
    sourceChannelIds, primaryRoute, primaryRole: correction.selection.primaryRole,
    roles: correction.facts.supportedRoles, consensusRoles: correction.consensusRoles,
    smallLongTailException: correction.selection.usedSmallLongTailException,
  });
  if (!primaryRoute) continue;
  const priorV15 = rows.map((row) => ({ channelId: row.channelId, score: row.score, levels: row.levels }));
  const score = evaluateV16Candidate({
    dossier, systemId: rows[0].systemId, channelId: primaryRoute, sourceChannelIds,
    submittedRank: Math.min(...rows.map((row) => row.submittedRank)), priorV15,
    hardValueOverride: independentByDossier.get(dossier.dossierId)?.valueGates,
    factsOverride: correction.facts,
    evaluationBasis: "v1.7-primary-channel-frozen-provider-neutral-evidence",
  });
  scores.push({
    ...score,
    primaryRole: correction.selection.primaryRole,
    primaryChannelReason: correction.selection.reason,
    allSupportedRoutes: correction.facts.correctedRoutes,
    usedSmallLongTailChannelException: correction.selection.usedSmallLongTailException,
  });
}

scores.sort((left, right) => left.systemId.localeCompare(right.systemId)
  || left.channelId.localeCompare(right.channelId) || right.score - left.score
  || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
const priorBySystem = new Map(prior.systems.map((item) => [item.systemId, item]));
const systemIds = [...new Set(scores.map((row) => row.systemId))].sort();
const systems = systemIds.map((systemId) => {
  const systemRows = scores.filter((row) => row.systemId === systemId);
  const originalCounts = Object.fromEntries(lanes.map((channelId) => [channelId,
    [...grouped.values()].filter((rows) => rows[0].systemId === systemId
      && rows.some((row) => row.channelId === channelId)).length])) as Record<BenchmarkLane, number>;
  const channels = lanes.map((channelId) => {
    const routed = systemRows.filter((row) => row.channelId === channelId);
    const eligible = routed.filter((row) => row.failedHardValueGates.length === 0)
      .sort((left, right) => right.score - left.score || left.submittedRank - right.submittedRank
        || left.companyName.localeCompare(right.companyName));
    const selected = eligible.slice(0, 10);
    const scoreSum = selected.reduce((sum, row) => sum + row.score, 0);
    const meanSelectedScore = Number((selected.length === 0 ? 0 : scoreSum / selected.length).toFixed(2));
    const completion = channelCompletionPenalty({ channelId, selectedCount: selected.length,
      originalSubmittedCount: originalCounts[channelId] });
    const adjustedChannelScore = meanSelectedScore * (1 - completion.penaltyRate);
    const selectedIds = new Set(selected.map((row) => row.dossierId));
    return {
      channelId,
      originalSubmittedCanonicalCount: originalCounts[channelId],
      routedCanonicalCandidates: routed.length,
      eligibleCandidates: eligible.length,
      selectedCount: selected.length,
      rejectedByHardValueGate: routed.length - eligible.length,
      meanSelectedScore,
      completionPenalty: completion,
      adjustedChannelScore: Number(adjustedChannelScore.toFixed(2)),
      candidates: routed.map((row) => ({ ...row,
        selectionStatus: row.failedHardValueGates.length > 0 ? "hard-gate-rejected"
          : selectedIds.has(row.dossierId) ? "selected" : "below-top10" })),
      selected: selected.map((row, index) => ({ ...row, finalRank: index + 1 })),
    };
  });
  const priorSystem = priorBySystem.get(systemId);
  return {
    systemId,
    channels,
    macroAdjustedChannelScore: Number((channels.reduce((sum, channel) => sum + channel.adjustedChannelScore, 0)
      / channels.length).toFixed(2)),
    priorV16Rank: priorSystem?.rank ?? null,
    priorV16Score: priorSystem?.macroMeanPerTargetSlot ?? null,
  };
}).sort((left, right) => right.macroAdjustedChannelScore - left.macroAdjustedChannelScore
  || left.systemId.localeCompare(right.systemId))
  .map((system, index) => ({ ...system, rank: index + 1 }));

const policy = {
  version: "primary-channel-and-completion-penalty-v1.7",
  candidateValueWeights: { productUseCaseFit: 44, cooperationPath: 32,
    independentInformationConfidence: 20, roleIdentificationQuality: 3, channelClassificationQuality: 1 },
  multiRoleRule: "All supported roles are retained, but each company occupies one primary display/scoring channel.",
  primaryChannelRule: "Distribution wins over downstream roles unless positive small-long-tail evidence activates the downstream exception.",
  standardShortfallPenalty: "2% multiplicative deduction from channel mean quality for every missing result below ten.",
  tier1DiscoveryShortfallPenalty: "3% per missing result when the provider originally submitted fewer than ten canonical Tier-1 candidates.",
  penaltyCap: "30%",
  modelClaim: "The product correction agent now receives this policy. This frozen benchmark applies the same evidence-grounded role ontology deterministically; it does not fabricate live model outputs.",
  frozenConsensusFallback: "When public role text is incomplete, Tier-1 is retained only if at least two independent benchmark systems submitted Distributor/VAD for the same canonical company; evidence confidence is not increased.",
};
const generatedAt = new Date().toISOString();
const scoreArtifact = {
  schemaVersion: 1, runId, generatedAt, policy, sourceEvidencePolicyVersion: master.policyVersion,
  summary: { inputV15Occurrences: v15.scores.length, canonicalSystemDossiers: grouped.size,
    finalPrimaryRoutedOccurrences: scores.length, duplicateOccurrencesSuppressed },
  scores,
};
const leaderboard = { schemaVersion: 1, runId, generatedAt, policy, systems };
await mkdir(scoringRoot, { recursive: true });
await writeFile(path.join(scoringRoot, "all-candidate-scores.v1.7.json"), `${JSON.stringify(scoreArtifact, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "leaderboard-primary-channel.v1.7.json"), `${JSON.stringify(leaderboard, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "primary-route-audit.v1.7.json"), `${JSON.stringify({ schemaVersion: 1,
  runId, generatedAt, routeAudit }, null, 2)}\n`, "utf8");

function cell(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}
function row(values: unknown[]): string { return `| ${values.map(cell).join(" | ")} |`; }
const report: string[] = [
  "# 多源销售线索发现测评 v1.7：主通道路由与温和数量惩罚",
  "",
  `生成时间：${generatedAt}`,
  "",
  "## 一、修改结论",
  "",
  "- 完整保留每家公司的所有证据支持角色，但每家公司只占一个主展示/计分通道。",
  "- 标准公司同时支持 Distributor/VAD 与下游角色时归入一级渠道；只有具备正面小型长尾证据时才优先归入下级渠道。",
  "- 通道基础分改为实际入榜候选的平均质量；不足十家时每少一家乘法扣减 2%。一级渠道原始提交已不足十家时，扣减提高为每家 3%。",
  "- v1.6 保留为历史报告；本报告不覆盖旧产物。",
  "",
  "## 二、排行榜",
  "",
  "| 排名 | 工具 | v1.7 | v1.6 | 一级渠道 | B2B 转售 | 项目服务 |",
  "|---:|---|---:|---:|---:|---:|---:|",
  ...systems.map((system) => row([system.rank, system.systemId, system.macroAdjustedChannelScore,
    system.priorV16Score ?? "—", ...lanes.map((lane) => system.channels.find((item) => item.channelId === lane)?.adjustedChannelScore ?? 0)])),
  "",
  "## 三、通道数量与惩罚明细",
  "",
  "| 工具 | 通道 | 原始提交 | 主路由后 | 入榜 | 候选均分 | 每缺一家 | 缺口 | 惩罚 | 通道分 |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...systems.flatMap((system) => system.channels.map((channel) => row([
    system.systemId, channel.channelId, channel.originalSubmittedCanonicalCount,
    channel.routedCanonicalCandidates, channel.selectedCount, channel.meanSelectedScore,
    `${(channel.completionPenalty.ratePerMissing * 100).toFixed(0)}%`, channel.completionPenalty.missingCount,
    `${(channel.completionPenalty.penaltyRate * 100).toFixed(0)}%`, channel.adjustedChannelScore,
  ]))),
  "",
  "## 四、一级渠道纠错审计",
  "",
  "下表披露原始一级渠道候选的最终主路由。进入 B2B 或项目服务不代表丢失其他角色；完整角色仍保留在候选记录中。",
  "",
  "| 工具 | 公司 | 原始通道 | 主通道 | 主角色 | 全部角色 | 共识补位 | 长尾例外 |",
  "|---|---|---|---|---|---|---|---|",
  ...routeAudit.filter((item) => item.sourceChannelIds.includes("tier1-distribution"))
    .sort((left, right) => left.systemId.localeCompare(right.systemId) || left.companyName.localeCompare(right.companyName))
    .map((item) => row([item.systemId, item.companyName, item.sourceChannelIds.join(", "), item.primaryRoute ?? "未分类",
      item.primaryRole ?? "未抽取", item.roles.join(", ") || "未抽取", item.consensusRoles.join(", ") || "否",
      item.smallLongTailException ? "是" : "否"])),
  "",
  "## 五、全部候选公司与评分明细",
  "",
];
for (const system of systems) {
  report.push(`### ${system.rank}. ${system.systemId}`, "");
  for (const channel of system.channels) {
    report.push(`#### ${channel.channelId}`, "",
      `原始 ${channel.originalSubmittedCanonicalCount} 家；主路由后 ${channel.routedCanonicalCandidates} 家；入榜 ${channel.selectedCount} 家；候选均分 ${channel.meanSelectedScore}；数量惩罚 ${(channel.completionPenalty.penaltyRate * 100).toFixed(0)}%；通道分 ${channel.adjustedChannelScore}。`, "",
      "| 状态 | 公司 | 总分 | Fit | Path | Confidence | 主角色 | 全部角色 | 来源通道 |",
      "|---|---|---:|---:|---:|---:|---|---|---|");
    for (const candidate of channel.candidates) {
      const name = candidate.officialUrl ? `[${candidate.companyName}](${candidate.officialUrl})` : candidate.companyName;
      report.push(row([candidate.selectionStatus, name, candidate.score, candidate.levels.productUseCaseFit,
        candidate.levels.cooperationPath, candidate.levels.independentInformationConfidence,
        candidate.primaryRole ?? "未抽取", candidate.facts.supportedRoles.join(", ") || "未抽取",
        candidate.sourceChannelIds.join(", ")]));
    }
    report.push("");
  }
}
report.push(
  "## 六、解释边界",
  "",
  "- 主通道是展示与本轮横向计分位置，不是对公司收入占比或唯一业务身份的断言。",
  "- 小型长尾例外必须由正面规模与长尾足迹证据触发；信息缺失、网站简单或搜索结果少不构成证据。",
  "- 原始一级渠道数按工具提交的规范化去重公司数计算；重复结果不会虚增数量。",
  "- 冻结证据无法直接证明角色时，只有至少两个独立测评系统对同一规范实体都提交 Distributor/VAD，才允许作一级渠道共识补位；该补位不会提高证据信心分。",
  "- 本轮没有重新搜索或新增人工盲审，只重用冻结证据并更正角色路由与数量惩罚。",
);
await writeFile(reportPath, `${report.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ runId, generatedAt, systems: systems.map((system) => ({
  rank: system.rank, systemId: system.systemId, score: system.macroAdjustedChannelScore,
})), outputs: { scoringRoot, reportPath } }, null, 2));
