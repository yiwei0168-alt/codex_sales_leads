import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { LeadSearchPlan } from "../../../src/lib/assistant/types";
import { OWNER_USER_ID } from "../../../src/lib/auth/config";
import { isCurrentLeadScoringEvidence } from "../../../src/lib/leads/evidence-snapshot";
import { buildLeadMarketPlaybook } from "../../../src/lib/leads/workflow/playbook";
import { LeadQualificationAgent } from "../../../src/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "../../../src/lib/leads/workflow/rag-context";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment } from "../../../src/lib/leads/workflow/types";
import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "../../../src/providers/contracts";
import { DeepSeekProvider } from "../../../src/providers/deepseek";

const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-fresh/role-aware-v2");
const outputRoot = path.join(runRoot, "v3-representative-ab");
const sampleGroups = {
  distribution: ["TD SYNNEX", "Herweck"],
  retail: ["JACOB Elektronik", "Tiger Technik"],
  services: ["CANCOM", "Kellner Telecom"],
  isp: ["DNS:NET"],
  hybrid: ["Bechtle", "Controlware"],
} as const;
const sampleNames = Object.values(sampleGroups).flat();
const strategicNames = ["TD SYNNEX", "Herweck", "Bechtle", "CANCOM"];
const allowedPathTypes = new Set(["Direct Tier-1 Supply", "Distributor-Mediated Supply",
  "Direct Downstream Channel Supply", "OEM/ODM", "Other"]);

interface UsageRecord { requestedModel: string; actualModel: string; promptTokens: number;
  completionTokens: number; reasoningTokens: number; totalTokens: number; latencyMs: number }

class MeteredProvider implements AiProvider {
  readonly id = "metered-deepseek";
  readonly usage: UsageRecord[] = [];
  constructor(private readonly inner = new DeepSeekProvider()) {}
  isConfigured(): boolean { return this.inner.isConfigured(); }
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal):
  Promise<StructuredAiResponse<TOutput>> {
    const response = await this.inner.execute<TInput, TOutput>(request, signal);
    this.usage.push({ requestedModel: request.modelVersion, actualModel: response.modelVersion,
      promptTokens: response.usage?.promptTokens ?? 0, completionTokens: response.usage?.completionTokens ?? 0,
      reasoningTokens: response.usage?.reasoningTokens ?? 0, totalTokens: response.usage?.totalTokens ?? 0,
      latencyMs: response.latencyMs });
    return response;
  }
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 100 : Number((numerator / denominator * 100).toFixed(1));
}

const [{ candidates }, { assessments: baselineAssessments }] = await Promise.all([
  readFile(path.join(runRoot, "corrected-candidates.json"), "utf8").then((value) => JSON.parse(value) as {
    candidates: CorrectedLeadWorkflowCandidate[] }),
  readFile(path.join(runRoot, "primary-assessments.json"), "utf8").then((value) => JSON.parse(value) as {
    assessments: LeadCandidateAssessment[] }),
]);
const previousAdaptive = await readFile(path.join(outputRoot, "result.json"), "utf8")
  .then((value) => JSON.parse(value) as { rows: Array<{ candidateId: string; optimizedRole: string;
    optimizedEligibility: string; optimizedScore: number }> }).catch(() => null);
const selected = sampleNames.map((needle) => candidates.find((candidate) =>
  candidate.companyName.toLocaleLowerCase("en").includes(needle.toLocaleLowerCase("en"))))
  .filter((candidate): candidate is CorrectedLeadWorkflowCandidate => Boolean(candidate));
if (selected.length !== sampleNames.length) throw new Error(`Representative sample incomplete: ${selected.length}/${sampleNames.length}`);
const baselineById = new Map(baselineAssessments.map((assessment) => [assessment.candidateId, assessment]));
const previousById = new Map((previousAdaptive?.rows ?? []).map((row) => [row.candidateId, row]));
const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "existing-distributor-growth",
  roles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP"],
  targetCount: selected.length, queryLanguage: "en",
  userRequest: "Representative v3 A/B of role-aware Cudy lead value with one or two companies per category." };
const rag = await retrieveLeadRagContext(OWNER_USER_ID, plan);
const playbook = await buildLeadMarketPlaybook(plan, rag);
const provider = new MeteredProvider();
if (!provider.isConfigured()) throw new Error("DEEPSEEK_API_KEY is required for the representative v3 A/B");
const optimized = await new LeadQualificationAgent(provider, { routineModel: "deepseek-v4-flash",
  escalationModel: "deepseek-v4-pro", batchSize: 3, concurrency: 6 })
  .evaluate(selected, playbook, "DE", "Germany", plan.objective);

const rows = optimized.map((assessment) => {
  const baseline = baselineById.get(assessment.candidateId);
  const candidate = selected.find((item) => item.candidateId === assessment.candidateId);
  if (!baseline || !candidate) throw new Error(`Missing A/B baseline for ${assessment.candidateId}`);
  const currentEvidenceIds = new Set(candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId)).map((item) => item.id));
  const usedIds = new Set([...assessment.evidenceIds,
    ...assessment.dimensionRationales.flatMap((rationale) => rationale.evidenceIds),
    ...assessment.cooperationPaths.flatMap((cooperationPath) => cooperationPath.evidenceIds)]);
  const tier1KaError = ["Distributor", "VAD"].includes(assessment.primaryRole) && assessment.accountTier === "KA";
  const previous = previousById.get(assessment.candidateId);
  return { candidateId: assessment.candidateId, companyName: candidate.companyName,
    category: Object.entries(sampleGroups).find(([, names]) => names.some((name) =>
      candidate.companyName.toLocaleLowerCase("en").includes(name.toLocaleLowerCase("en"))))?.[0] ?? "unknown",
    strategic: strategicNames.some((name) => candidate.companyName.toLocaleLowerCase("en").includes(name.toLocaleLowerCase("en"))),
    completed: assessment.scoringStatus === "completed", baselineRole: baseline.primaryRole,
    optimizedRole: assessment.primaryRole, roleAgreement: baseline.primaryRole === assessment.primaryRole,
    baselineEligibility: baseline.eligibilityStatus, optimizedEligibility: assessment.eligibilityStatus,
    eligibilityAgreement: baseline.eligibilityStatus === assessment.eligibilityStatus,
    baselineScore: baseline.totalScore, optimizedScore: assessment.totalScore,
    absoluteScoreDifference: Math.abs(baseline.totalScore - assessment.totalScore),
    previousOptimizedRole: previous?.optimizedRole ?? null,
    repeatRoleAgreement: previous ? previous.optimizedRole === assessment.primaryRole : null,
    previousOptimizedEligibility: previous?.optimizedEligibility ?? null,
    repeatEligibilityAgreement: previous ? previous.optimizedEligibility === assessment.eligibilityStatus : null,
    previousOptimizedScore: previous?.optimizedScore ?? null,
    repeatAbsoluteScoreDifference: previous ? Math.abs(previous.optimizedScore - assessment.totalScore) : null,
    pathCount: assessment.cooperationPaths.length,
    pathTaxonomyValid: assessment.cooperationPaths.every((item) => allowedPathTypes.has(item.pathType)),
    pathConfidenceAbsent: assessment.cooperationPaths.every((item) => !("confidence" in item)),
    evidenceReferencesValid: [...usedIds].every((id) => currentEvidenceIds.has(id)), tier1KaError };
});
const measuredTokens = provider.usage.reduce((sum, usage) => sum + usage.totalTokens, 0);
const perCompanyTokens = measuredTokens / rows.length;
const baseline81PerCompanyTokens = 10_545_272 / 81;
const previousOptimizedPerCompanyTokens = 7_757_415 / 207;
const tokenReductionPercent = Number(((1 - perCompanyTokens / baseline81PerCompanyTokens) * 100).toFixed(1));
const repeatRows = rows.filter((row) => row.repeatAbsoluteScoreDifference !== null);
const repeatMad = repeatRows.length === 0 ? null : Number((repeatRows.reduce((sum, row) =>
  sum + (row.repeatAbsoluteScoreDifference ?? 0), 0) / repeatRows.length).toFixed(2));
const historicalMad = Number((rows.reduce((sum, row) => sum + row.absoluteScoreDifference, 0) / rows.length).toFixed(2));
const metrics = {
  sampleSize: rows.length,
  samplePerCategory: Object.fromEntries(Object.entries(sampleGroups).map(([key, value]) => [key, value.length])),
  completedPercent: percent(rows.filter((row) => row.completed).length, rows.length),
  strategicCandidateRecallPercent: percent(rows.filter((row) => row.strategic && row.completed).length,
    rows.filter((row) => row.strategic).length),
  repeatReferenceAvailable: repeatRows.length === rows.length,
  repeatPrimaryRoleAgreementPercent: percent(rows.filter((row) => row.repeatRoleAgreement).length, rows.length),
  repeatEligibilityAgreementPercent: percent(rows.filter((row) => row.repeatEligibilityAgreement).length, rows.length),
  repeatMeanAbsoluteScoreDifference: repeatMad,
  historicalPrimaryRoleAgreementPercent: percent(rows.filter((row) => row.roleAgreement).length, rows.length),
  historicalEligibilityAgreementPercent: percent(rows.filter((row) => row.eligibilityAgreement).length, rows.length),
  historicalMeanAbsoluteScoreDifference: historicalMad,
  validEvidenceReferencePercent: percent(rows.filter((row) => row.evidenceReferencesValid).length, rows.length),
  pathPolicyPercent: percent(rows.filter((row) => row.pathCount <= 2 && row.pathTaxonomyValid
    && row.pathConfidenceAbsent).length, rows.length),
  tier1DistributorKaErrors: rows.filter((row) => row.tier1KaError).length,
  modelRequests: provider.usage.length, measuredModelTokens: measuredTokens,
  measuredTokensPerCompany: Math.round(perCompanyTokens), baseline81TokensPerCompany: Math.round(baseline81PerCompanyTokens),
  previousOptimizedTokensPerCompany: Math.round(previousOptimizedPerCompanyTokens),
  tokenReductionVsPreviousOptimizedPercent: Number(((1 - perCompanyTokens / previousOptimizedPerCompanyTokens) * 100).toFixed(1)),
  tokenReductionVs81Percent: tokenReductionPercent,
  paidSearchHistoricalActual: { baseline81CreditsPerCompany: 5.41, optimized207CreditsPerCompany: 3.36,
    reductionPercent: 37.8, note: "Historical actual; this frozen-evidence representative A/B made no paid search calls." },
};
const gates = { completed: metrics.completedPercent === 100,
  strategicRecall: metrics.strategicCandidateRecallPercent === 100,
  repeatReference: metrics.repeatReferenceAvailable,
  primaryRole: metrics.repeatPrimaryRoleAgreementPercent >= 97,
  eligibility: metrics.repeatEligibilityAgreementPercent >= 97,
  scoreStability: metrics.repeatMeanAbsoluteScoreDifference !== null
    && metrics.repeatMeanAbsoluteScoreDifference <= 3,
  evidenceReferences: metrics.validEvidenceReferencePercent === 100,
  pathPolicy: metrics.pathPolicyPercent === 100,
  tier1Ka: metrics.tier1DistributorKaErrors === 0,
  tokenTarget: metrics.tokenReductionVsPreviousOptimizedPercent >= 40,
  paidSearchTarget: metrics.paidSearchHistoricalActual.reductionPercent >= 30 };
const passed = Object.values(gates).every(Boolean);
const result = { schemaVersion: 1, runId: "2026-08-30-de-v3-representative-ab",
  method: "representative-live-scoring-on-frozen-current-evidence", generatedAt: new Date().toISOString(),
  passed, productionTopNUsedForEscalation: false, metrics, gates, rows, usage: provider.usage };
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(path.join(outputRoot, "report.md"), [
  "# v3 代表性 A/B 与成本门禁",
  "",
  `- 结论：${passed ? "PASS" : "FAIL"}`,
  `- 样本：${metrics.sampleSize} 家；每类 1–2 家（${Object.entries(metrics.samplePerCategory).map(([key, value]) => `${key}=${value}`).join("，")}）`,
  `- 完成率：${metrics.completedPercent}%；战略候选召回：${metrics.strategicCandidateRecallPercent}%`,
  `- 重复运行主角色一致率：${metrics.repeatPrimaryRoleAgreementPercent}%；eligibility 一致率：${metrics.repeatEligibilityAgreementPercent}%`,
  `- 重复运行 MAD：${metrics.repeatMeanAbsoluteScoreDifference ?? "无参考"}（门禁 ≤3）`,
  `- 相对旧 v2 结果 MAD：${metrics.historicalMeanAbsoluteScoreDifference}（诊断项；评分机制已按用户确认发生实质变化，不作为门禁）`,
  `- 有效证据引用率：${metrics.validEvidenceReferencePercent}%；路径规则：${metrics.pathPolicyPercent}%；一级代理商 KA 错误：${metrics.tier1DistributorKaErrors}`,
  `- 本轮实际评分 token：${metrics.measuredModelTokens.toLocaleString("en-US")}，${metrics.measuredTokensPerCompany.toLocaleString("en-US")}/公司；相对上一轮 207 家优化实测 ${metrics.previousOptimizedTokensPerCompany.toLocaleString("en-US")}/公司降低 ${metrics.tokenReductionVsPreviousOptimizedPercent}%，相对 81 家旧基线降低 ${metrics.tokenReductionVs81Percent}%`,
  `- 付费搜索历史实测：5.41 → 3.36 credits/公司，降低 ${metrics.paidSearchHistoricalActual.reductionPercent}%；本轮冻结证据 A/B 未重新搜索。`,
  "",
  "Top-N 不参与正式产品升级门禁。本 A/B 只验证角色、资格、分数稳定性、证据、路径结构和成本。",
  "",
  "| 公司 | 类别 | 主角色 | 首次 v3 | 重复 v3 | |Δ| | eligibility 一致 | 路径数 |",
  "|---|---|---|---:|---:|---:|---|---:|",
  ...rows.map((row) => `| ${row.companyName.replaceAll("|", "\\|")} | ${row.category} | ${row.optimizedRole} | ${row.previousOptimizedScore ?? "—"} | ${row.optimizedScore} | ${row.repeatAbsoluteScoreDifference ?? "—"} | ${row.repeatEligibilityAgreement ? "是" : "否"} | ${row.pathCount} |`),
  "",
].join("\n"), "utf8");
console.log(JSON.stringify({ passed, metrics, gates, outputRoot }, null, 2));
if (!passed) process.exitCode = 2;
