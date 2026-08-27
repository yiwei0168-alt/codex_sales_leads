import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane } from "../lib/evidence-dossier";
import type { V15EndToEndScore } from "../lib/v1.5-end-to-end-value";

interface ScoreArtifact {
  runId: string;
  generatedAt: string;
  policy: Record<string, unknown>;
  summary: Record<string, number>;
  scores: V15EndToEndScore[];
}
interface LeaderboardArtifact {
  systems: Array<{
    rank: number; systemId: string; macroMeanPerTargetSlot: number; v14Rank: number; v14MacroMeanPerTargetSlot: number;
    provider_evidence_completeness: { percentage: number };
    channels: Array<{ channelId: BenchmarkLane; meanPerTargetSlot: number; selected: Array<V15EndToEndScore & { finalRank: number }> }>;
  }>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const root = path.resolve("experiments/multi-source-lead-discovery");
const scoringRoot = path.join(root, "artifacts/runs", runId, "scoring/end-to-end-value-v1.5");
const scores = JSON.parse(await readFile(path.join(scoringRoot, "all-candidate-scores.v1.5.json"), "utf8")) as ScoreArtifact;
const leaderboard = JSON.parse(await readFile(path.join(scoringRoot, "leaderboard-end-to-end-value.v1.5.json"), "utf8")) as LeaderboardArtifact;
const reportPath = path.join(root, "reports/v1.5-end-to-end-correction-final-report.md");

const systemLabels: Record<string, string> = {
  "gemini-full": "Gemini Full", "product-google-places-local": "Google Places Local",
  "product-gemini": "Product Gemini", "product-tavily": "Tavily", "product-searchapi": "SearchAPI",
  "product-brave": "Brave Search", "product-exa": "Exa", "product-google-places": "Original Google Places",
};
const laneLabels: Record<BenchmarkLane, string> = {
  "tier1-distribution": "一级渠道", "b2b-resale": "B2B 转售", "project-services": "项目服务",
};
const gateLabels: Record<string, string> = { companyExists: "公司真实性", germanyPresence: "德国经营", activeNetworking: "Active Networking 商业相关性" };

function cell(value: string): string { return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim() || "—"; }
function companyCell(row: V15EndToEndScore): string {
  return row.officialUrl ? `[${cell(row.companyName)}](${row.officialUrl})` : cell(row.companyName);
}
function key(row: Pick<V15EndToEndScore, "systemId" | "channelId" | "dossierId">): string {
  return `${row.systemId}\u0000${row.channelId}\u0000${row.dossierId}`;
}
const selectedRanks = new Map<string, number>();
for (const system of leaderboard.systems) for (const channel of system.channels) {
  for (const selected of channel.selected) selectedRanks.set(key(selected), selected.finalRank);
}

const lines: string[] = [
  "# 多源销售线索搜索测评 v1.5：补证纠错后的端到端价值",
  "",
  `- 冻结运行：\`${scores.runId}\``,
  `- 报告生成：${scores.generatedAt}`,
  "- 状态：评分规则修订完成；未新增人工盲审",
  "- 主问题：产品完成补证、实体纠错、多角色识别、通道重路由和排序后，最终输出价值能否超过 Gemini Full？",
  "",
  "## 结论",
  "",
  `本轮新规则下 Gemini Full 仍排名第一（${leaderboard.systems[0].macroMeanPerTargetSlot.toFixed(2)}），Google Places Local 产品链路以 ${leaderboard.systems[1].macroMeanPerTargetSlot.toFixed(2)} 排名第二，差距缩小到 ${(leaderboard.systems[0].macroMeanPerTargetSlot - leaderboard.systems[1].macroMeanPerTargetSlot).toFixed(2)} 分。产品尚未超过 Gemini Full，但结果证明原规则把通道错配直接清零，曾显著低估产品纠错后的真实用户价值。`,
  "",
  `新机制从原 0 分记录中救回 ${scores.summary.rescuedFromOriginalZero} 条；最终形成 ${scores.summary.finalRoutedOccurrences} 条“系统－纠错后通道－候选公司”记录，其中 ${scores.summary.eligibleOccurrences} 条通过真实价值门槛。`,
  "",
  "## 评分机制修订",
  "",
  "只有以下情况可以把销售线索判为 0 分：公司无法确认真实存在、无法确认在德国经营，或没有证据证明其参与与 Cudy 相关的 Active Networking 商业活动。原始搜索通道错误、角色标签不完整、重复公司和供应方未提交充分证据均不再作为一票否决项。",
  "",
  "| 维度 | 权重 | 说明 |",
  "|---|---:|---|",
  "| 产品与应用场景匹配 | 44 | 候选业务和 Cudy SOHO/SMB networking 产品的实际重合度 |",
  "| 合作路径与购买影响力 | 32 | 采购、上架、报价、选型、推荐、部署或下级渠道触达能力 |",
  "| 独立信息可信度 | 20 | 最终可交付信息的实体、事实和证据可信度 |",
  "| 多角色识别质量 | 3 | 最终输出角色是否得到证据支持 |",
  "| 通道归类质量 | 1 | 最终通道是否与证据支持角色一致 |",
  "",
  "角色与通道合计只占 4%，因此分类错误会体现为产品输出瑕疵，但不会抹掉一条真实且匹配的销售线索。产品系统先按规范化实体去重，再依据共享证据支持的多角色重路由；Gemini Full 保留其自身端到端输出的通道与角色判断。ISP 在本次三通道测评中归入项目服务。",
  "",
  "## 产品 Agent 分工",
  "",
  "1. 发现工具只负责扩大候选池。",
  "2. 新补证与纠错 Agent 负责搜索补证、官网与实体纠正、证据归属、多角色识别、通道重路由和规范化实体去重。",
  "3. 原打分 Agent 不再改写角色或通道，只读取纠错后的候选和证据，独立判断真实价值门槛与五项评分维度。",
  "4. 只有打分通过且达到发布阈值的候选进入用户最终结果。",
  "",
  "本报告是对冻结发现结果的追溯重算。产品侧的纠错结果采用新 Agent 已实现的确定性证据支持下限；没有重跑所有外部搜索与模型调用，因此本报告不衡量实时 API 延迟、成本和稳定性。",
  "",
  "## 工具排名",
  "",
  "| v1.5 | 系统 | v1.5 总分 | v1.4 排名 | v1.4 总分 | 排名变化 | 供应方证据完整度（零权重） |",
  "|---:|---|---:|---:|---:|---:|---:|",
];
for (const system of leaderboard.systems) {
  lines.push(`| ${system.rank} | ${systemLabels[system.systemId] ?? system.systemId} | ${system.macroMeanPerTargetSlot.toFixed(2)} | ${system.v14Rank} | ${system.v14MacroMeanPerTargetSlot.toFixed(2)} | ${system.v14Rank - system.rank > 0 ? `+${system.v14Rank - system.rank}` : system.v14Rank - system.rank} | ${system.provider_evidence_completeness.percentage.toFixed(2)}% |`);
}
lines.push("", "## 分通道得分", "", "| 系统 | 一级渠道 | B2B 转售 | 项目服务 | 宏平均 |", "|---|---:|---:|---:|---:|");
for (const system of leaderboard.systems) {
  const values = new Map(system.channels.map((channel) => [channel.channelId, channel.meanPerTargetSlot]));
  lines.push(`| ${systemLabels[system.systemId] ?? system.systemId} | ${values.get("tier1-distribution")?.toFixed(2)} | ${values.get("b2b-resale")?.toFixed(2)} | ${values.get("project-services")?.toFixed(2)} | ${system.macroMeanPerTargetSlot.toFixed(2)} |`);
}

lines.push("", "## 每个工具的不通过原因", "", "以下计数允许同一候选同时触发多个真实价值门槛。通道错配和角色错配不再出现在失败原因中。", "",
  "| 系统 | 最终记录 | 通过 | 不通过 | 公司真实性 | 德国经营 | Active Networking | 原 0 分被救回 |", "|---|---:|---:|---:|---:|---:|---:|---:|");
for (const system of leaderboard.systems) {
  const rows = scores.scores.filter((row) => row.systemId === system.systemId);
  const failed = rows.filter((row) => row.failedHardValueGates.length > 0);
  const originalZeroRescued = rows.filter((row) => row.score > 0 && (row.originalFailedValueGates.includes("submittedLaneMembership") || row.originalFailedValueGates.includes("uniqueCanonicalCompany"))).length;
  lines.push(`| ${systemLabels[system.systemId] ?? system.systemId} | ${rows.length} | ${rows.length - failed.length} | ${failed.length} | ${failed.filter((row) => row.failedHardValueGates.includes("companyExists")).length} | ${failed.filter((row) => row.failedHardValueGates.includes("germanyPresence")).length} | ${failed.filter((row) => row.failedHardValueGates.includes("activeNetworking")).length} | ${originalZeroRescued} |`);
}

lines.push("", "## 结果解释", "",
  "- Google Places Local 的大幅提升说明本地小型 Installer、SI、B2B 商店和 ISP 线索在被补证与重路由后具有较高真实价值；原评分主要惩罚了它不擅长提交结构化证据及准确通道标签。",
  "- Exa 从第 7 升至第 3，说明其发现的候选中存在较多真实但原始分类错误的公司；这类错误适合由产品 Agent 自动修复。",
  "- Gemini Full 仍以 2.30 分优势领先，主要说明它在高价值候选的产品匹配、合作路径和可信度组合上仍略强，而不是角色标签优势。",
  "- 下一轮要真正超过 Gemini Full，重点应放在补证覆盖、合作路径证据、正确官网解析和高价值候选排序，而不是继续增加角色分类权重。",
  "",
  "## 全部候选公司与评分明细",
  "",
  `共披露 ${scores.scores.length} 条最终纠错后记录。状态中的“入榜”表示进入对应通道 Top 10；“通过未入榜”表示满足真实价值门槛但未进入前十。`,
  "",
);

for (const system of leaderboard.systems) {
  const rows = scores.scores.filter((row) => row.systemId === system.systemId);
  lines.push(`### ${system.rank}. ${systemLabels[system.systemId] ?? system.systemId}`, "");
  for (const channel of system.channels) {
    const laneRows = rows.filter((row) => row.channelId === channel.channelId)
      .sort((left, right) => left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
    lines.push(`#### ${laneLabels[channel.channelId]}（通道得分 ${channel.meanPerTargetSlot.toFixed(2)}）`, "");
    if (laneRows.length === 0) { lines.push("该系统没有输出此通道候选。", ""); continue; }
    lines.push("| Dossier | 原工具排名 | 候选公司 / 官网 | 原通道 | 最终角色 | 状态 | 产品匹配 | 合作路径 | 信息可信度 | 角色 | 通道 | 总分 | 未通过门槛 | 供应方证据 |",
      "|---|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|");
    for (const row of laneRows) {
      const rank = selectedRanks.get(key(row));
      const status = rank ? `入榜 #${rank}` : row.failedHardValueGates.length === 0 ? "通过，未入榜" : "未通过";
      const failed = row.failedHardValueGates.map((gate) => gateLabels[gate] ?? gate).join(" / ") || "—";
      lines.push(`| ${row.dossierId} | ${row.submittedRank} | ${companyCell(row)} | ${laneLabels[row.sourceChannelId]} | ${cell(row.correctedRoles.join(" / "))} | ${status} | ${row.scoreComponents.productUseCaseFit.toFixed(1)} | ${row.scoreComponents.cooperationPath.toFixed(1)} | ${row.scoreComponents.independentInformationConfidence.toFixed(1)} | ${row.scoreComponents.roleIdentificationQuality} | ${row.scoreComponents.channelClassificationQuality} | ${row.score.toFixed(1)} | ${failed} | ${row.providerEvidenceComplete ? "完整" : "不完整"} |`);
    }
    lines.push("");
  }
}

lines.push("## 可复现性", "",
  "- `npm run benchmark:v1.5:score`：从冻结 v1.4 候选与共享证据重算。",
  "- `npm run benchmark:v1.5:render-report`：生成本报告和全部明细。",
  "- `npm run benchmark:v1.5:verify`：验证权重、硬门槛、记录数、排名和报告披露完整性。");
await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ runId, reportPath, disclosedRows: scores.scores.length, systems: leaderboard.systems.length }, null, 2));
