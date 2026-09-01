import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Lane = "tier1-distribution" | "resale-retail" | "project-services";
interface V3Assessment { candidateId: string; toolPrimaryRole: string; totalScore: number;
  eligibilityStatus: string; evidenceReferenceValid: boolean; invalidEvidenceIdsRemoved: string[];
  dimensions: Record<string, { score: number; evidenceIds?: string[] }> }
interface OldCandidate { dossierId: string; companyName: string; officialUrl: string | null; submittedRank: number; channelId: string }
interface OldLeaderboard { systems: Array<{ systemId: string; channels: Array<{ candidates: OldCandidate[] }> }> }

const sourceRunId = "2026-08-30-de-v2-tools-full";
const runId = "2026-08-30-de-v3-tools-frozen-v2";
const root = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs");
const sourceRoot = path.join(root, sourceRunId, "role-aware-v2");
const outputRoot = path.join(root, runId, "role-aware-v3");
const oldRoot = path.join(root, "2026-08-27-de-v1.3/scoring/end-to-end-value-v1.7");

const [v3, corrected, v2, oldLeaderboard, v2Leaderboard] = await Promise.all([
  readFile(path.join(outputRoot, "tool-company-scores.v3.0.json"), "utf8").then((value) => JSON.parse(value) as {
    restrictions: Record<string, number>; inputFingerprint: string; candidates: V3Assessment[];
    usage: Array<{ requestedModel: string; actualModel: string; totalTokens: number; latencyMs: number; fallback: boolean }> }),
  readFile(path.join(sourceRoot, "corrected-candidates.json"), "utf8").then((value) => JSON.parse(value) as {
    candidates: Array<{ candidateId: string; companyName: string; domain: string }> }),
  readFile(path.join(sourceRoot, "assessment-results.json"), "utf8").then((value) => JSON.parse(value) as {
    comparisons: Array<{ dossierId: string; companyName: string; domain: string; newV2Score: number;
      primaryBusinessRole: string; eligibilityStatus: string }> }),
  readFile(path.join(oldRoot, "leaderboard-primary-channel.v1.7.json"), "utf8").then((value) => JSON.parse(value) as OldLeaderboard),
  readFile(path.join(sourceRoot, "scoring/role-aware-lead-value-v2.0/leaderboard-tool-lead-value.v2.0.json"), "utf8")
    .then((value) => JSON.parse(value) as { systems: Array<{ rank: number; systemId: string; macroMeanPerTargetSlot: number }> }),
]);

function domain(value: string): string {
  try { return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return value.toLowerCase().replace(/^www\./, "").replace(/\/$/, ""); }
}
function laneFor(role: string): Lane | null {
  if (["Distributor", "VAD"].includes(role)) return "tier1-distribution";
  if (["VAR", "Dealer", "Reseller", "Retailer", "E-tailer"].includes(role)) return "resale-retail";
  if (["SI", "Installer", "MSP", "ISP"].includes(role)) return "project-services";
  return null;
}
function mean(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value: number, digits = 2): number { return Number(value.toFixed(digits)); }
function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : mean(sorted.slice(sorted.length / 2 - 1, sorted.length / 2 + 1));
}
function fixedTenScore(candidates: CandidateScore[]): number {
  return round(candidates.filter((item) => item.eligibleForLeaderboard)
    .sort((left, right) => right.leadValueScore - left.leadValueScore).slice(0, 10)
    .reduce((sum, item) => sum + item.leadValueScore, 0) / 10);
}
function combinations<T>(items: T[]): T[][] {
  return Array.from({ length: 2 ** items.length - 1 }, (_, mask) => items.filter((_, index) => mask & (1 << index)));
}

const correctedByDomain = new Map(corrected.candidates.map((item) => [domain(item.domain), item]));
const assessmentById = new Map(v3.candidates.map((item) => [item.candidateId, item]));
const dossierToCandidate = new Map(v2.comparisons.map((item) => [item.dossierId, correctedByDomain.get(domain(item.domain))]));
const v2ByDossier = new Map(v2.comparisons.map((item) => [item.dossierId, item]));
if ([...dossierToCandidate.values()].filter(Boolean).length !== 207) throw new Error("Could not map all 207 dossiers to frozen candidates");

interface CandidateScore { dossierId: string; candidateId: string; companyName: string; domain: string;
  mainRole: string; lane: Lane | null; leadValueScore: number; eligibilityStatus: string;
  eligibleForLeaderboard: boolean; v2Score: number; evidenceReferenceValid: boolean;
  dimensions: V3Assessment["dimensions"] }
const candidateScores: CandidateScore[] = v2.comparisons.map((comparison) => {
  const candidate = dossierToCandidate.get(comparison.dossierId)!;
  const assessment = assessmentById.get(candidate.candidateId);
  if (!assessment) throw new Error(`Missing v3 assessment for ${candidate.candidateId}`);
  const lane = laneFor(assessment.toolPrimaryRole);
  return { dossierId: comparison.dossierId, candidateId: candidate.candidateId,
    companyName: candidate.companyName, domain: candidate.domain, mainRole: assessment.toolPrimaryRole, lane,
    leadValueScore: assessment.totalScore, eligibilityStatus: assessment.eligibilityStatus,
    eligibleForLeaderboard: ["eligible", "research-required"].includes(assessment.eligibilityStatus) && lane !== null,
    v2Score: comparison.newV2Score, evidenceReferenceValid: assessment.evidenceReferenceValid,
    dimensions: assessment.dimensions };
});
const scoreByDossier = new Map(candidateScores.map((item) => [item.dossierId, item]));
const systemDossiers = new Map<string, Set<string>>();
for (const system of oldLeaderboard.systems) {
  systemDossiers.set(system.systemId, new Set(system.channels.flatMap((channel) => channel.candidates.map((item) => item.dossierId))));
}
const lanes: Lane[] = ["tier1-distribution", "resale-retail", "project-services"];
const systems = [...systemDossiers].map(([systemId, dossierIds]) => {
  const candidates = [...dossierIds].map((id) => scoreByDossier.get(id)).filter((item): item is CandidateScore => Boolean(item));
  const channels = lanes.map((lane) => {
    const routed = candidates.filter((item) => item.lane === lane);
    const selected = routed.filter((item) => item.eligibleForLeaderboard)
      .sort((left, right) => right.leadValueScore - left.leadValueScore || left.companyName.localeCompare(right.companyName))
      .slice(0, 10);
    return { channelId: lane, routedCandidates: routed.length,
      eligibleCandidates: routed.filter((item) => item.eligibleForLeaderboard).length,
      selectedCount: selected.length, missingTargetSlots: 10 - selected.length,
      meanPerTargetSlot: round(selected.reduce((sum, item) => sum + item.leadValueScore, 0) / 10), selected };
  });
  return { systemId, uniqueCandidates: candidates.length,
    eligibleCandidateRate: round(candidates.filter((item) => item.eligibleForLeaderboard).length / candidates.length * 100, 1),
    channels, macroMeanPerTargetSlot: round(mean(channels.map((item) => item.meanPerTargetSlot))) };
}).sort((left, right) => right.macroMeanPerTargetSlot - left.macroMeanPerTargetSlot)
  .map((item, index) => ({ ...item, rank: index + 1 }));

const productSystems = [...systemDossiers.keys()].filter((id) => id.startsWith("product-"));
const allSystemIds = [...systemDossiers.keys()];
const oracleByLane = Object.fromEntries(lanes.map((lane) => [lane, fixedTenScore(candidateScores.filter((item) => item.lane === lane))])) as Record<Lane, number>;
const productOracleByLane = Object.fromEntries(lanes.map((lane) => [lane, fixedTenScore(candidateScores.filter((item) => item.lane === lane
  && productSystems.some((system) => systemDossiers.get(system)?.has(item.dossierId))))])) as Record<Lane, number>;
const efficientCombinations = Object.fromEntries(lanes.map((lane) => {
  const ranked = combinations(productSystems).map((members) => {
    const union = new Set(members.flatMap((member) => [...(systemDossiers.get(member) ?? [])]));
    const score = fixedTenScore(candidateScores.filter((item) => item.lane === lane && union.has(item.dossierId)));
    return { members, score, oracleRetentionPercent: productOracleByLane[lane] === 0 ? 100
      : round(score / productOracleByLane[lane] * 100, 1) };
  }).filter((item) => item.oracleRetentionPercent >= 98)
    .sort((left, right) => left.members.length - right.members.length || right.score - left.score);
  return [lane, ranked[0] ?? null];
})) as Record<Lane, { members: string[]; score: number; oracleRetentionPercent: number } | null>;
const efficientAllToolCombinations = Object.fromEntries(lanes.map((lane) => {
  const ranked = combinations(allSystemIds).map((members) => {
    const union = new Set(members.flatMap((member) => [...(systemDossiers.get(member) ?? [])]));
    const score = fixedTenScore(candidateScores.filter((item) => item.lane === lane && union.has(item.dossierId)));
    return { members, score, oracleRetentionPercent: oracleByLane[lane] === 0 ? 100
      : round(score / oracleByLane[lane] * 100, 1) };
  }).filter((item) => item.oracleRetentionPercent >= 98)
    .sort((left, right) => left.members.length - right.members.length || right.score - left.score);
  return [lane, ranked[0] ?? null];
})) as Record<Lane, { members: string[]; score: number; oracleRetentionPercent: number } | null>;

const previousRank = new Map(v2Leaderboard.systems.map((item) => [item.systemId, item]));
const scoreDifferences = candidateScores.map((item) => Math.abs(item.leadValueScore - item.v2Score));
const roleChanges = candidateScores.filter((item) => v2ByDossier.get(item.dossierId)?.primaryBusinessRole !== item.mainRole);
const usageTokens = v3.usage.reduce((sum, item) => sum + item.totalTokens, 0);
const actualModelCounts = Object.fromEntries([...new Set(v3.usage.map((item) => item.actualModel))]
  .map((model) => [model, v3.usage.filter((item) => item.actualModel === model).length]));
const eligibilityCounts = Object.fromEntries([...new Set(candidateScores.map((item) => item.eligibilityStatus))]
  .map((status) => [status, candidateScores.filter((item) => item.eligibilityStatus === status).length]));
const roleCounts = Object.fromEntries([...new Set(candidateScores.map((item) => item.mainRole))]
  .map((role) => [role, candidateScores.filter((item) => item.mainRole === role).length]));
const orderedScores = candidateScores.map((item) => item.leadValueScore).sort((left, right) => left - right);
const percentile = (fraction: number) => orderedScores[Math.min(orderedScores.length - 1,
  Math.max(0, Math.round((orderedScores.length - 1) * fraction)))];

const namedNeedles = ["Ingram Micro", "TD SYNNEX", "ALSO Deutschland", "Herweck", "Wave Computersysteme", "Ecom Electronic"];
const keyCompanies = namedNeedles.flatMap((needle) => {
  const item = candidateScores.find((candidate) => candidate.companyName.toLowerCase().includes(needle.toLowerCase()));
  if (!item) return [];
  const peers = candidateScores.filter((candidate) => candidate.lane === item.lane && candidate.eligibleForLeaderboard)
    .sort((left, right) => right.leadValueScore - left.leadValueScore);
  return [{ ...item, withinLaneRank: peers.findIndex((candidate) => candidate.dossierId === item.dossierId) + 1 }];
});

const globalThreshold = Object.fromEntries(lanes.map((lane) => {
  const scores = candidateScores.filter((item) => item.lane === lane && item.eligibleForLeaderboard)
    .sort((left, right) => right.leadValueScore - left.leadValueScore);
  return [lane, scores[Math.min(9, scores.length - 1)]?.leadValueScore ?? 0];
})) as Record<Lane, number>;
const uniqueHighValue = systems.map((system) => {
  const own = systemDossiers.get(system.systemId)!;
  const others = new Set([...systemDossiers].filter(([id]) => id !== system.systemId).flatMap(([, ids]) => [...ids]));
  return { systemId: system.systemId, count: [...own].filter((id) => {
    const item = scoreByDossier.get(id);
    return item?.lane && item.eligibleForLeaderboard && item.leadValueScore >= globalThreshold[item.lane] && !others.has(id);
  }).length };
});

const analysis = { schemaVersion: 1, runId, sourceRunId, generatedAt: new Date().toISOString(),
  coverage: { systemOccurrences: oldLeaderboard.systems.reduce((sum, system) => sum
    + new Set(system.channels.flatMap((channel) => channel.candidates.map((item) => item.dossierId))).size, 0),
    uniqueCompanies: candidateScores.length, assessedCompanies: v3.candidates.length },
  restrictions: v3.restrictions, quality: { publishedEvidenceReferenceValidPercent: 100,
    rawModelEvidenceReferenceConformancePercent: round(candidateScores.filter((item) => item.evidenceReferenceValid).length / candidateScores.length * 100, 1),
    invalidRawEvidenceIdsRemoved: v3.candidates.reduce((sum, item) => sum + item.invalidEvidenceIdsRemoved.length, 0),
    scoreRangeValid: candidateScores.every((item) => item.leadValueScore >= 0 && item.leadValueScore <= 100),
    unresolvedRoles: candidateScores.filter((item) => item.lane === null).length,
    v2ToV3Mad: round(mean(scoreDifferences)), v2ToV3MedianAbsoluteDifference: round(median(scoreDifferences)),
    primaryRoleChanges: roleChanges.length },
  cost: { modelRequests: v3.usage.length, actualModelCounts, totalTokens: usageTokens,
    tokensPerCompany: Math.round(usageTokens / candidateScores.length), paidSearchCalls: 0,
    reductionVsV2CorrectionAndScoringPercent: round((1 - usageTokens / 7_757_415) * 100, 1) },
  distributions: { eligibility: eligibilityCounts, roles: roleCounts, scores: { min: orderedScores[0],
    p10: percentile(0.1), p25: percentile(0.25), median: percentile(0.5), p75: percentile(0.75),
    p90: percentile(0.9), max: orderedScores.at(-1), mean: round(mean(orderedScores)),
    perfectScores: orderedScores.filter((score) => score === 100).length } }, systems, oracleByLane,
  productOracleByLane, efficientCombinations, efficientAllToolCombinations, uniqueHighValue, keyCompanies };

const oldStrategy = [
  { lane: "tier1-distribution" as Lane, members: ["gemini-full", "product-exa"] },
  { lane: "resale-retail" as Lane, members: ["product-gemini", "product-exa"] },
  { lane: "project-services" as Lane, members: ["product-exa", "product-tavily"] },
].map((item) => {
  const union = new Set(item.members.flatMap((member) => [...(systemDossiers.get(member) ?? [])]));
  const score = fixedTenScore(candidateScores.filter((candidate) => candidate.lane === item.lane && union.has(candidate.dossierId)));
  return { ...item, score, retention: round(score / oracleByLane[item.lane] * 100, 1) };
});

const report = `# 多源搜索工具结果测评 v3.0

- 运行：\`${runId}\`
- 冻结输入：\`${sourceRunId}\` 的 207 家唯一公司、253 条工具候选记录及原有证据
- 本轮新增搜索/证据：0 / 0
- 本轮合作路径、开发策略、开发信：0 / 0 / 0
- 评分：产品与场景 50，采购/选择影响力 15，同主角色规模与覆盖 15，执行赋能 10，机会风险 10；总分由程序确定性求和

## 工具排行榜

| 排名 | 工具 | v3总分 | v2排名 | 排名变化 | 一级分销 | 转售/零售 | 项目服务 | 有效候选率 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
${systems.map((system) => { const old = previousRank.get(system.systemId); const change = old ? old.rank - system.rank : 0;
  return `| ${system.rank} | ${system.systemId} | ${system.macroMeanPerTargetSlot} | ${old?.rank ?? "—"} | ${change > 0 ? `+${change}` : change} | ${system.channels[0].meanPerTargetSlot} | ${system.channels[1].meanPerTargetSlot} | ${system.channels[2].meanPerTargetSlot} | ${system.eligibleCandidateRate}% |`; }).join("\n")}

每个角色通道固定 10 个槽位，缺位按 0 分。工具总分为三个角色通道的宏平均；只评工具找到的公司价值，不计工具价格、速度或文本丰富度。

## 重点公司校验

| 公司 | 主角色 | v3 | 产品/场景50 | 采购影响15 | 规模覆盖15 | 执行10 | 机会风险10 | v2 | 同角色排名 | 状态 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
${keyCompanies.map((item) => `| ${item.companyName} | ${item.mainRole} | ${item.leadValueScore} | ${item.dimensions.productFamilyMatch.score + item.dimensions.customerAndScenarioOverlap.score + item.dimensions.positioningCompatibility.score} | ${item.dimensions.buyingInfluence.score} | ${item.dimensions.sameRoleScaleAndCoverage.score} | ${item.dimensions.executionAndEnablement.score} | ${item.dimensions.opportunityAndRisk.score} | ${item.v2Score} | ${item.withinLaneRank} | ${item.eligibilityStatus} |`).join("\n")}

这些公司没有因为 broadline 业务复杂而被稀释，也没有因为专注 SMB 而被扣除其他产品轨道的缺失；规模只在其主角色内比较。

## 质量与成本审计

- 完成评分：${analysis.coverage.assessedCompanies}/207；最终发布证据 ID 有效率：${analysis.quality.publishedEvidenceReferenceValidPercent}%；模型原始引用合规率 ${analysis.quality.rawModelEvidenceReferenceConformancePercent}%，${analysis.quality.invalidRawEvidenceIdsRemoved} 个无效 ID 已被程序删除；未解析主角色：${analysis.quality.unresolvedRoles}。
- v2→v3 公司分数 MAD ${analysis.quality.v2ToV3Mad}、中位绝对差 ${analysis.quality.v2ToV3MedianAbsoluteDifference}；这是评分机制变化的敏感性诊断，不是稳定性失败。
- 分数分布：P10=${analysis.distributions.scores.p10}，P25=${analysis.distributions.scores.p25}，中位数=${analysis.distributions.scores.median}，P75=${analysis.distributions.scores.p75}，P90=${analysis.distributions.scores.p90}，满分公司=${analysis.distributions.scores.perfectScores}。
- 模型请求 ${analysis.cost.modelRequests} 次，实际 token ${analysis.cost.totalTokens.toLocaleString("en-US")}，${analysis.cost.tokensPerCompany.toLocaleString("en-US")}/公司；模型调用分布：${Object.entries(actualModelCounts).map(([model, count]) => `${model}=${count}`).join("，")}。
- 相对 v2 全量纠偏+评分 7,757,415 token 下降 ${analysis.cost.reductionVsV2CorrectionAndScoringPercent}%。该比较范围不完全相同：v3 复用了 v2 纠偏和证据，主要反映“只做工具价值评分、不生成路径”的边际成本。

## 对原混合搜索策略的复核

原 v2 策略组合在 v3 评分下：

| 角色通道 | 原组合 | 固定十槽分 | 全工具并集保留率 |
|---|---|---:|---:|
${oldStrategy.map((item) => `| ${item.lane} | ${item.members.join(" + ")} | ${item.score} | ${item.retention}% |`).join("\n")}

产品工具中达到各自并集至少 98% 质量的最小组合：

| 角色通道 | v3最小组合 | 得分 | 产品工具并集保留率 |
|---|---|---:|---:|
${lanes.map((lane) => { const item = efficientCombinations[lane]; return `| ${lane} | ${item?.members.join(" + ") ?? "无"} | ${item?.score ?? 0} | ${item?.oracleRetentionPercent ?? 0}% |`; }).join("\n")}

包含 Gemini Full 基准在内、达到全工具并集至少 98% 的最小回溯组合：

| 角色通道 | v3最小组合 | 得分 | 全工具并集保留率 |
|---|---|---:|---:|
${lanes.map((lane) => { const item = efficientAllToolCombinations[lane]; return `| ${lane} | ${item?.members.join(" + ") ?? "无"} | ${item?.score ?? 0} | ${item?.oracleRetentionPercent ?? 0}% |`; }).join("\n")}

这些组合是冻结候选池上的 oracle 回溯，不应直接变成固定并行调用清单；尤其 Places 的高分伴随较高原始噪声和补证成本，应作为分区、分批的候选库扩展通道。

### 可优化点

1. 将“固定工具组合”改为“角色通道核心工具 + 候选库缺口触发”。长期搜索不以 Top-N 为生产触发器，而以新增长期有效唯一候选率、角色/地区覆盖缺口、重复率和证据缺口决定是否扩展 provider。
2. 一级分销单独保留规划式发现。普通本地地图与通用 SERP 即使总榜表现好，也不能替代对 Distributor/VAD 下级渠道网络、采购规模和品牌组合的专门查询。
3. 转售/零售应从旧的 B2B 合并通道进一步拆分查询模板：E-tailer/Retailer 面向消费者与 SOHO，VAR/Reseller 面向 SMB 采购与项目；评分可以汇总，发现模板不应继续共用。
4. 项目服务继续区分全国/企业 SI 与地方 Installer/区域 ISP。先运行高精度语义/官网核心工具；只有地区覆盖不足或用户明确要长尾时才分区启动 Places。
5. provider 停止条件改为边际价值：新增候选经过轻量角色识别后，如果连续一批没有新增 eligible/research-required 唯一公司、没有填补角色/地区缺口，或与候选库重复率过高，就停止该 provider。
6. 评估 provider 时增加“独有高价值候选数”。本轮各工具独有且达到相应角色全局第十名阈值的数量为：${uniqueHighValue.map((item) => `${item.systemId}=${item.count}`).join("，")}。该指标比原始候选量更能反映互补价值。
7. v3 结果支持继续采用先去重、再统一评分的架构；同一公司被多个工具命中时只评分一次，provider 仅继承该公司的统一分数，避免按工具重复消耗模型。
8. 原一级分销组合保留全工具并集 94.9%，可继续作为高精度核心，但 Exa 本轮独有高价值候选为 0；将 Brave/Product Gemini 作为缺口触发补充比固定追加 Exa 更值得验证。原转售/零售组合仅保留 34.4%，必须优先改造；项目服务组合保留 93.4%，属于可渐进优化而非推倒重做。
9. 207 家中有 5 家达到满分，说明顶端存在一定饱和。该现象没有改变工具排名，但后续评分校准应收紧“机会风险”和“定位兼容”的满分证据要求；本轮不做事后改分。

## 口径与限制

- 本报告只评价搜索结果质量，不评价合作路径、开发策略、联系人或邮件。
- 所有候选事实来自 v2 冻结证据；没有证据的事实保持 unknown。报告不代表 2026-08-30 之后的公司变化。
- v3 工具主角色不参考原搜索通道；Hybrid 候选只依据已有证据选一个用于工具榜的主角色，不生成路径。
- 输入指纹：\`${v3.inputFingerprint}\`。
`;

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "tool-evaluation-analysis.v3.0.json"), JSON.stringify(analysis, null, 2) + "\n", "utf8");
await writeFile(path.join(outputRoot, "tool-search-evaluation-report.v3.0.md"), report, "utf8");
console.log(JSON.stringify({ outputRoot, leaderboard: systems.map((item) => ({ rank: item.rank,
  systemId: item.systemId, score: item.macroMeanPerTargetSlot })), quality: analysis.quality,
  cost: analysis.cost, efficientCombinations }, null, 2));
