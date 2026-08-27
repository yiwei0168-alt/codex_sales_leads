import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane } from "../lib/evidence-dossier";
import type { V14OccurrenceScore } from "../lib/v1.4-independent-value";

interface LeaderboardArtifact {
  systems: Array<{
    rank: number;
    systemId: string;
    macroMeanPerTargetSlot: number;
    provider_evidence_completeness: { percentage: number };
    channels: Array<{
      channelId: BenchmarkLane;
      meanPerTargetSlot: number;
      selected: Array<V14OccurrenceScore & { finalRank: number }>;
    }>;
  }>;
}

interface ScoreArtifact {
  scores: V14OccurrenceScore[];
}

const beginMarker = "<!-- BEGIN GENERATED V1.4 CANDIDATE DISCLOSURE -->";
const endMarker = "<!-- END GENERATED V1.4 CANDIDATE DISCLOSURE -->";
const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const experimentRoot = path.resolve("experiments/multi-source-lead-discovery");
const scoringRoot = path.join(experimentRoot, "artifacts/runs", runId, "scoring/independent-value-v1.4");
const scoreArtifact = JSON.parse(await readFile(path.join(scoringRoot, "all-candidate-scores.v1.4.json"), "utf8")) as ScoreArtifact;
const leaderboard = JSON.parse(await readFile(path.join(scoringRoot, "leaderboard-independent-value.v1.4.json"), "utf8")) as LeaderboardArtifact;
const reportPath = path.join(experimentRoot, "reports/v1.4-independent-value-final-report.md");
const currentReport = await readFile(reportPath, "utf8");

const systemLabels: Record<string, string> = {
  "gemini-full": "Gemini Full",
  "product-google-places-local": "Google Places Local",
  "product-gemini": "Product Gemini",
  "product-tavily": "Tavily",
  "product-searchapi": "SearchAPI",
  "product-brave": "Brave Search",
  "product-exa": "Exa",
  "product-google-places": "Original Google Places",
};
const laneLabels: Record<BenchmarkLane, string> = {
  "tier1-distribution": "一级渠道",
  "b2b-resale": "B2B 转售",
  "project-services": "项目服务",
};
const gateLabels: Record<string, string> = {
  companyExists: "公司真实性",
  germanyPresence: "德国经营",
  activeNetworking: "Active Networking",
  submittedLaneMembership: "提交通道业务",
  uniqueCanonicalCompany: "公司去重",
};

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim() || "—";
}

function companyCell(score: V14OccurrenceScore): string {
  const name = cell(score.companyName);
  return score.officialUrl ? `[${name}](${score.officialUrl})` : name;
}

function rowKey(score: Pick<V14OccurrenceScore, "systemId" | "channelId" | "dossierId">): string {
  return `${score.systemId}\u0000${score.channelId}\u0000${score.dossierId}`;
}

const selectedRank = new Map<string, number>();
for (const system of leaderboard.systems) {
  for (const channel of system.channels) {
    for (const selected of channel.selected) selectedRank.set(rowKey(selected), selected.finalRank);
  }
}

const lines: string[] = [
  beginMarker,
  "## 全部工具候选公司与评分明细",
  "",
  `本附录披露 v1.4 的全部 ${scoreArtifact.scores.length} 条去重后“工具－通道－候选公司”记录，而不是只披露最终入榜候选。表格按工具原始提交排名排列。`,
  "",
  "状态说明：`入榜 #n` 表示该候选进入对应通道的最终 Top 10；`通过，未入榜` 表示价值门槛通过但总分未进入 Top 10；`未通过` 后列出失败的实质价值门槛。供应方证据完整度只反映工具是否提交非空 URL 与摘录，主评分权重为 0。",
  "",
];

for (const system of leaderboard.systems) {
  const systemScores = scoreArtifact.scores.filter((score) => score.systemId === system.systemId);
  lines.push(`### ${system.rank}. ${systemLabels[system.systemId] ?? system.systemId}`);
  lines.push("");
  lines.push(`共 ${systemScores.length} 条候选记录；三通道宏平均 ${system.macroMeanPerTargetSlot.toFixed(2)}；供应方证据完整度 ${system.provider_evidence_completeness.percentage.toFixed(2)}%（零权重）。`);
  lines.push("");
  for (const channel of system.channels) {
    const channelScores = systemScores.filter((score) => score.channelId === channel.channelId)
      .sort((left, right) => left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
    lines.push(`#### ${laneLabels[channel.channelId]}（通道得分 ${channel.meanPerTargetSlot.toFixed(2)}）`);
    lines.push("");
    if (channelScores.length === 0) {
      lines.push("该工具没有在此通道提交候选。");
      lines.push("");
      continue;
    }
    lines.push("| Dossier | 工具排名 | 候选公司 / 官网 | 支持角色 | 状态 | 产品匹配 | 合作路径 | 信息可信度 | 总分 | 未通过门槛 | 供应方证据 | 评分来源 |");
    lines.push("|---|---:|---|---|---|---:|---:|---:|---:|---|---|---|");
    for (const score of channelScores) {
      const finalRank = selectedRank.get(rowKey(score));
      const eligible = score.failedValueGates.length === 0 && score.independentDecisionStatus !== "verified-fail";
      const status = finalRank ? `入榜 #${finalRank}` : eligible ? "通过，未入榜" : "未通过";
      const failed = score.failedValueGates.map((gate) => gateLabels[gate] ?? gate).join(" / ") || "—";
      lines.push([
        score.dossierId,
        score.submittedRank,
        companyCell(score),
        cell(score.supportedRoles.join(" / ")),
        status,
        score.levels.productUseCaseFit,
        score.levels.cooperationPath,
        score.levels.independentInformationConfidence,
        score.score,
        failed,
        score.providerEvidenceComplete ? "完整" : "不完整",
        score.evaluationBasis === "v1.4-independent-adjudication" ? "v1.4 独立核验" : "v1.3.1 共享证据",
      ].map((value) => ` ${value} `).join("|").replace(/^/, "|").replace(/$/, "|"));
    }
    lines.push("");
  }
}
lines.push(endMarker, "");

const generated = lines.join("\n");
const beginIndex = currentReport.indexOf(beginMarker);
const endIndex = currentReport.indexOf(endMarker);
let nextReport: string;
if (beginIndex >= 0 && endIndex > beginIndex) {
  nextReport = `${currentReport.slice(0, beginIndex)}${generated}${currentReport.slice(endIndex + endMarker.length).replace(/^\r?\n?/, "")}`;
} else {
  nextReport = `${currentReport.trimEnd()}\n\n${generated}`;
}
await writeFile(reportPath, nextReport, "utf8");
console.log(JSON.stringify({ runId, reportPath, disclosedRows: scoreArtifact.scores.length, systems: leaderboard.systems.length }, null, 2));
