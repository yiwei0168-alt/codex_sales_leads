import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BenchmarkLane, SharedEvidenceDossier } from "../lib/evidence-dossier";
import {
  evaluateV16Candidate,
  extractV16Facts,
  targetRoutesForV16,
  type V16UnifiedScore,
} from "../lib/v1.6-unified-rescoring";

interface MasterArtifact { policyVersion: string; companies: SharedEvidenceDossier[] }
interface V15Row {
  dossierId: string;
  systemId: string;
  channelId: BenchmarkLane;
  submittedRank: number;
  score: number;
  levels: {
    productUseCaseFit: number;
    cooperationPath: number;
    independentInformationConfidence: number;
  };
  providerEvidenceComplete: boolean;
}
interface V15Artifact { scores: V15Row[] }
interface V15Leaderboard { systems: Array<{ systemId: string; rank: number; macroMeanPerTargetSlot: number }> }
interface FrozenIndependentArtifact {
  decisions: Array<{
    dossierId: string;
    resolvedOfficialUrl?: string;
    valueGates: {
      companyExists: boolean;
      germanyPresence: boolean;
      activeNetworking: boolean;
    };
    evidence: Array<{ url: string; supports: string[] }>;
  }>;
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9) ?? "2026-08-27-de-v1.3";
const experimentRoot = path.resolve("experiments/multi-source-lead-discovery");
const runRoot = path.join(experimentRoot, "artifacts/runs", runId);
const scoringRoot = path.join(runRoot, "scoring/end-to-end-value-v1.6");
const reportPath = path.join(experimentRoot, "reports/v1.6-unified-rescoring-report.md");
const masterPath = path.join(runRoot, "evidence/shared-evidence-dossiers.v1.json");
const v15Path = path.join(runRoot, "scoring/end-to-end-value-v1.5/all-candidate-scores.v1.5.json");
const v15LeaderboardPath = path.join(runRoot, "scoring/end-to-end-value-v1.5/leaderboard-end-to-end-value.v1.5.json");
const independentPath = path.join(runRoot, "evaluation/v1.4/gemini-full-independent-decisions.json");
const master = JSON.parse(await readFile(masterPath, "utf8")) as MasterArtifact;
const v15 = JSON.parse(await readFile(v15Path, "utf8")) as V15Artifact;
const v15Leaderboard = JSON.parse(await readFile(v15LeaderboardPath, "utf8")) as V15Leaderboard;
const independent = JSON.parse(await readFile(independentPath, "utf8")) as FrozenIndependentArtifact;
const independentByDossier = new Map(independent.decisions.map((decision) => [decision.dossierId, decision]));
for (const dossier of master.companies) {
  const decision = independentByDossier.get(dossier.dossierId);
  if (!decision) continue;
  if (decision.resolvedOfficialUrl) dossier.canonicalOfficialUrl = decision.resolvedOfficialUrl;
  dossier.claimCoverage.identity = decision.valueGates.companyExists;
  dossier.claimCoverage.germanyPresence = decision.valueGates.germanyPresence;
  dossier.claimCoverage.activeNetworking = decision.valueGates.activeNetworking;
  const existingUrls = new Set(dossier.evidence.filter((item) => item.sourceType !== "discovery-summary").map((item) => item.url));
  for (const [index, item] of decision.evidence.entries()) {
    if (existingUrls.has(item.url)) continue;
    dossier.evidence.push({
      evidenceId: `V14-INDEPENDENT-${dossier.dossierId}-${index + 1}`,
      url: item.url,
      excerpt: item.supports.join("; "),
      sourceType: "official-company",
      acquisition: "fallback-search",
      capturedAt: null,
      sourceSystems: [],
    });
  }
}
const dossierById = new Map(master.companies.map((dossier) => [dossier.dossierId, dossier]));
const lanes: BenchmarkLane[] = ["tier1-distribution", "b2b-resale", "project-services"];

const grouped = new Map<string, V15Row[]>();
for (const row of v15.scores) {
  const key = `${row.systemId}\u0000${row.dossierId}`;
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

const scores: V16UnifiedScore[] = [];
let duplicateOccurrencesSuppressed = 0;
let routeExpansions = 0;
for (const rows of grouped.values()) {
  const dossier = dossierById.get(rows[0].dossierId);
  if (!dossier) throw new Error(`Missing dossier ${rows[0].dossierId}`);
  duplicateOccurrencesSuppressed += Math.max(0, rows.length - 1);
  const sourceChannelIds = [...new Set(rows.map((row) => row.channelId))];
  const facts = extractV16Facts(dossier);
  const targetRoutes = targetRoutesForV16(facts, sourceChannelIds);
  routeExpansions += Math.max(0, targetRoutes.length - 1);
  const priorV15 = rows.map((row) => ({ channelId: row.channelId, score: row.score, levels: row.levels }));
  for (const channelId of targetRoutes) {
    scores.push(evaluateV16Candidate({
      dossier,
      systemId: rows[0].systemId,
      channelId,
      sourceChannelIds,
      submittedRank: Math.min(...rows.map((row) => row.submittedRank)),
      priorV15,
      hardValueOverride: independentByDossier.get(dossier.dossierId)?.valueGates,
    }));
  }
}

scores.sort((left, right) => left.systemId.localeCompare(right.systemId) || left.channelId.localeCompare(right.channelId)
  || right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));

const v15RankBySystem = new Map(v15Leaderboard.systems.map((system) => [system.systemId, system]));
const systemIds = [...new Set(scores.map((row) => row.systemId))].sort();
const systems = systemIds.map((systemId) => {
  const systemRows = scores.filter((row) => row.systemId === systemId);
  const channels = lanes.map((channelId) => {
    const routed = systemRows.filter((row) => row.channelId === channelId);
    const eligible = routed.filter((row) => row.failedHardValueGates.length === 0)
      .sort((left, right) => right.score - left.score || left.submittedRank - right.submittedRank || left.companyName.localeCompare(right.companyName));
    const selected = eligible.slice(0, 10);
    const top10ScoreSum = selected.reduce((sum, row) => sum + row.score, 0);
    return {
      channelId,
      routedCanonicalCandidates: routed.length,
      eligibleCandidates: eligible.length,
      selectedCount: selected.length,
      rejectedByHardValueGate: routed.length - eligible.length,
      top10ScoreSum: Number(top10ScoreSum.toFixed(2)),
      meanPerTargetSlot: Number((top10ScoreSum / 10).toFixed(2)),
      meanSelectedScore: selected.length === 0 ? 0 : Number((top10ScoreSum / selected.length).toFixed(2)),
      selected: selected.map((row, index) => ({ ...row, finalRank: index + 1 })),
    };
  });
  const v15System = v15RankBySystem.get(systemId);
  return {
    systemId,
    channels,
    macroMeanPerTargetSlot: Number((channels.reduce((sum, channel) => sum + channel.meanPerTargetSlot, 0) / lanes.length).toFixed(2)),
    v15Rank: v15System?.rank ?? null,
    v15MacroMeanPerTargetSlot: v15System?.macroMeanPerTargetSlot ?? null,
  };
}).sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot || left.systemId.localeCompare(right.systemId))
  .map((system, index) => ({ ...system, rank: index + 1 }));

const policy = {
  version: "unified-frozen-evidence-rescoring-v1.6",
  status: "deterministic-auditable-frozen-evidence-rescore",
  comparisonTarget: "Final candidate value after a common correction and scoring pass for every provider, including Gemini Full.",
  hardValueGates: ["companyExists", "germanyPresence", "activeNetworking"],
  weights: {
    productUseCaseFit: 44,
    cooperationPath: 32,
    independentInformationConfidence: 20,
    roleIdentificationQuality: 3,
    channelClassificationQuality: 1,
    maximum: 100,
  },
  uniformityRule: "No provider inherits v1.3/v1.4/v1.5 value levels or independent adjudication. All five dimensions are recomputed from the same frozen provider-neutral dossier.",
  correctionRule: "Every provider is canonical-entity deduplicated, assigned multiple evidence-supported roles, and rerouted to those roles. Original lanes are retained only when no supported role route can be extracted. Cooperation path is scored only for the current corrected route.",
  evidenceRule: "Discovery summaries are excluded. Shared dossiers are augmented with frozen v1.4 independently verified URL/support facts, attached by canonical dossier and then made provider-neutral; prior levels and pass/fail decisions are not inherited.",
  modelClaim: "No model call or new human judgment was fabricated. This is a deterministic auditable rescore, not a claim that a live multi-agent scorer was run.",
};
const generatedAt = new Date().toISOString();
const v15PriorScores = new Map(v15.scores.map((row) => [`${row.systemId}\u0000${row.dossierId}\u0000${row.channelId}`, row.score]));
const changedValueLevels = scores.filter((row) => row.priorV15.some((prior) => prior.levels.productUseCaseFit !== row.levels.productUseCaseFit
  || prior.levels.cooperationPath !== row.levels.cooperationPath
  || prior.levels.independentInformationConfidence !== row.levels.independentInformationConfidence)).length;
const rescuedPriorLow = scores.filter((row) => row.score >= 50 && row.priorV15.some((prior) => prior.score > 0 && prior.score < 50)).length;
const scoreArtifact = {
  schemaVersion: 1,
  runId,
  generatedAt,
  status: policy.status,
  sourceEvidencePolicyVersion: master.policyVersion,
  policy,
  sources: {
    v15ScoresComparisonOnly: path.relative(experimentRoot, v15Path).replaceAll("\\", "/"),
    sharedDossiers: path.relative(experimentRoot, masterPath).replaceAll("\\", "/"),
    frozenIndependentEvidence: path.relative(experimentRoot, independentPath).replaceAll("\\", "/"),
  },
  summary: {
    inputV15Occurrences: v15.scores.length,
    canonicalSystemDossiers: grouped.size,
    finalRoutedOccurrences: scores.length,
    duplicateOccurrencesSuppressed,
    routeExpansions,
    eligibleOccurrences: scores.filter((row) => row.failedHardValueGates.length === 0).length,
    rejectedOccurrences: scores.filter((row) => row.failedHardValueGates.length > 0).length,
    changedValueLevels,
    rescuedPriorLow,
  },
  scores,
};
const leaderboardArtifact = {
  schemaVersion: 1,
  runId,
  generatedAt,
  status: policy.status,
  policy,
  interpretation: {
    mainRanking: "Unified deterministic value rescore from frozen provider-neutral evidence.",
    limitation: "The frozen dossier can still omit or mis-associate facts. A live v1.6 run should recollect unresolved evidence and use model-based independent scoring with disagreement escalation.",
    comparability: "All providers, including Gemini Full and Google Places Local, use identical correction, evidence and scoring rules.",
  },
  systems,
};

function tableRow(values: Array<string | number | null>): string {
  return `| ${values.map((value) => String(value ?? "—").replaceAll("|", "\\|")).join(" | ")} |`;
}

const report: string[] = [
  "# v1.6 统一补证后重评分报告",
  "",
  `生成时间：${generatedAt}`,
  "",
  "> 本报告是对冻结候选池和冻结共享证据的可审计确定性重评分。它修复了 v1.5 继承旧价值等级的问题，但没有伪造新的模型判断或人工判断，也不等同于已经执行了实时网页补证的正式生产回放。",
  "",
  "## 一、修订口径",
  "",
  "v1.6 对 Gemini Full 与全部产品工具使用完全相同的处理：规范实体去重、多角色事实抽取、按纠错后角色重新分流，并从 provider-neutral dossier 独立重算产品匹配、当前通道合作路径、信息置信度、角色和通道五项。只有无法抽取受支持角色时才保留原通道作为 fallback。v1.3/v1.4/v1.5 的等级和 Gemini Full 独立裁决均不参与新分，只用于敏感性对照。",
  "",
  "冻结的 v1.4 独立裁决中已经核验的 URL、逐项 supports 和三项硬门槛事实会按 dossier 合并进共享证据；合并后同一公司被任何工具发现都使用同一份事实。旧裁决的 0–5 等级、总分和通道 pass/fail 均不继承。",
  "",
  "硬门槛仍为公司真实、德国经营、active networking；权重仍为 44/32/20/3/1。发现摘要不参与正式打分。",
  "",
  "## 二、排行榜",
  "",
  "| 排名 | 工具 | v1.6 | v1.5 | 变化 | 一级渠道 | B2B 转售 | 项目服务 |",
  "|---:|---|---:|---:|---:|---:|---:|---:|",
  ...systems.map((system) => tableRow([
    system.rank,
    system.systemId,
    system.macroMeanPerTargetSlot,
    system.v15MacroMeanPerTargetSlot,
    system.v15MacroMeanPerTargetSlot === null ? "—" : Number((system.macroMeanPerTargetSlot - system.v15MacroMeanPerTargetSlot).toFixed(2)),
    system.channels.find((channel) => channel.channelId === "tier1-distribution")?.meanPerTargetSlot ?? 0,
    system.channels.find((channel) => channel.channelId === "b2b-resale")?.meanPerTargetSlot ?? 0,
    system.channels.find((channel) => channel.channelId === "project-services")?.meanPerTargetSlot ?? 0,
  ])),
  "",
  "## 三、重算影响",
  "",
  `- v1.5 输入出现次数：${v15.scores.length}；规范化 system-company 数：${grouped.size}；v1.6 路由后出现次数：${scores.length}。`,
  `- ${changedValueLevels} 条候选记录至少有一个价值等级不同于其 v1.5 来源记录。`,
  `- ${rescuedPriorLow} 条记录从 v1.5 的 0–50 分区间被统一重算至不低于 50 分。`,
  "- 分数发生变化只证明评分实现已改变，不是质量提升的证据；质量判断必须结合已知错评回归、验证器不变量以及后续抽样复核。",
  "- 排名变化同时受到价值重算、所有工具统一实体去重和所有工具统一角色重路由影响，因此不能只归因于某一个正则修复。",
  "",
  "## 四、各工具入榜候选与评分明细",
  "",
];

for (const system of systems) {
  report.push(`### ${system.rank}. ${system.systemId}`, "");
  for (const channel of system.channels) {
    report.push(`#### ${channel.channelId}`, "",
      "| 名次 | 公司 | 总分 | Fit | Path | Confidence | 角色 | 来源通道 |",
      "|---:|---|---:|---:|---:|---:|---|---|");
    for (const row of channel.selected) {
      const name = row.officialUrl ? `[${row.companyName}](${row.officialUrl})` : row.companyName;
      report.push(tableRow([row.finalRank, name, row.score, row.levels.productUseCaseFit,
        row.levels.cooperationPath, row.levels.independentInformationConfidence,
        row.facts.supportedRoles.join(", ") || "未抽取", row.sourceChannelIds.join(", ")]));
    }
    report.push("");
  }
}

const auditNames = ["4Networks", "Teamtrade", "Frings", "Netz-Werker", "HANSA", "SHC Netzwerktechnik"];
const auditRows = scores.filter((row) => auditNames.some((name) => row.companyName.toLowerCase().includes(name.toLowerCase())))
  .sort((left, right) => left.companyName.localeCompare(right.companyName) || left.systemId.localeCompare(right.systemId));
report.push(
  "## 五、v1.5 已知低估样本回归",
  "",
  "| 公司 | 工具 | 通道 | v1.5 来源分 | v1.6 | Fit/Path/Confidence | 抽取角色 |",
  "|---|---|---|---:|---:|---|---|",
  ...auditRows.map((row) => tableRow([
    row.companyName, row.systemId, row.channelId,
    Math.max(...row.priorV15.map((prior) => prior.score)), row.score,
    `${row.levels.productUseCaseFit}/${row.levels.cooperationPath}/${row.levels.independentInformationConfidence}`,
    row.facts.supportedRoles.join(", ") || "未抽取",
  ])),
  "",
  "## 六、解释边界与后续正式运行要求",
  "",
  "本轮确定性抽取扩大了德语业务动作、Value-Add/Distributor 语序、采购/选型/项目实施、常见相邻品牌和产品族覆盖，并取消了企业级词一出现就先于产品族证据把 fit 全局压低的旧短路。每条评分记录都披露结构化事实、命中的证据 URL、分项理由和旧分对照。",
  "",
  "仍需避免把本报告理解为语义模型的最终真值：正则可以漏掉同义表达，也可能把同页无关上下文错误组合；共享 dossier 本身可能抓取失败或收错页面。正式 v1.6 应重新运行补证 Agent，再由独立评分 Agent 从结构化逐项引用事实评分；低分异常、证据冲突或两 Agent 结论不一致时升级复核。",
  "",
  "可复现命令：",
  "",
  "```bash",
  "node scripts/run-tsx.cjs experiments/multi-source-lead-discovery/scripts/score-v1.6-unified.ts",
  "```",
  "",
  "机器可读输出：",
  "",
  "- `artifacts/runs/2026-08-27-de-v1.3/scoring/end-to-end-value-v1.6/all-candidate-scores.v1.6.json`",
  "- `artifacts/runs/2026-08-27-de-v1.3/scoring/end-to-end-value-v1.6/leaderboard-end-to-end-value.v1.6.json`",
  "",
);

await mkdir(scoringRoot, { recursive: true });
await writeFile(path.join(scoringRoot, "all-candidate-scores.v1.6.json"), `${JSON.stringify(scoreArtifact, null, 2)}\n`, "utf8");
await writeFile(path.join(scoringRoot, "leaderboard-end-to-end-value.v1.6.json"), `${JSON.stringify(leaderboardArtifact, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${report.join("\n").trimEnd()}\n`, "utf8");

console.log(JSON.stringify({
  runId,
  ...scoreArtifact.summary,
  leaderboard: systems.map((system) => ({
    rank: system.rank,
    systemId: system.systemId,
    score: system.macroMeanPerTargetSlot,
    v15: system.v15MacroMeanPerTargetSlot,
  })),
  priorScoreLookupCount: v15PriorScores.size,
  report: path.relative(experimentRoot, reportPath).replaceAll("\\", "/"),
}, null, 2));
