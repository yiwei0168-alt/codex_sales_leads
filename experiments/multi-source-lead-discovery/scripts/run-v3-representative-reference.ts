import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { LeadSearchPlan } from "../../../src/lib/assistant/types";
import { OWNER_USER_ID } from "../../../src/lib/auth/config";
import { buildLeadMarketPlaybook } from "../../../src/lib/leads/workflow/playbook";
import { LeadQualificationAgent } from "../../../src/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "../../../src/lib/leads/workflow/rag-context";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment } from "../../../src/lib/leads/workflow/types";
import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "../../../src/providers/contracts";
import { DeepSeekProvider } from "../../../src/providers/deepseek";

const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-fresh/role-aware-v2");
const outputRoot = path.join(runRoot, "v3-representative-ab");
const adaptive = JSON.parse(await readFile(path.join(outputRoot, "result.json"), "utf8")) as {
  rows: Array<{ candidateId: string; companyName: string; category: string; optimizedRole: string;
    optimizedEligibility: string; optimizedScore: number; completed: boolean; evidenceReferencesValid: boolean;
    pathCount: number; pathTaxonomyValid: boolean; pathConfidenceAbsent: boolean; tier1KaError: boolean }>;
  metrics: { measuredModelTokens: number; measuredTokensPerCompany: number;
    tokenReductionVs81Percent: number; paidSearchHistoricalActual: { reductionPercent: number } };
};
const { candidates } = JSON.parse(await readFile(path.join(runRoot, "corrected-candidates.json"), "utf8")) as {
  candidates: CorrectedLeadWorkflowCandidate[] };
const selectedIds = new Set(adaptive.rows.map((row) => row.candidateId));
const selected = candidates.filter((candidate) => selectedIds.has(candidate.candidateId));
if (selected.length !== adaptive.rows.length) throw new Error("Reference sample does not match the adaptive arm.");

interface UsageRecord { promptTokens: number; completionTokens: number; reasoningTokens: number;
  totalTokens: number; latencyMs: number }
class MeteredProvider implements AiProvider {
  readonly id = "metered-deepseek-pro";
  readonly usage: UsageRecord[] = [];
  constructor(private readonly inner = new DeepSeekProvider()) {}
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal):
  Promise<StructuredAiResponse<TOutput>> {
    const response = await this.inner.execute<TInput, TOutput>(request, signal);
    this.usage.push({ promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0, reasoningTokens: response.usage?.reasoningTokens ?? 0,
      totalTokens: response.usage?.totalTokens ?? 0, latencyMs: response.latencyMs });
    return response;
  }
}
const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "existing-distributor-growth",
  roles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP"],
  targetCount: selected.length, queryLanguage: "en", userRequest: "High-capability reference arm for representative v3 A/B." };
const playbook = await buildLeadMarketPlaybook(plan, await retrieveLeadRagContext(OWNER_USER_ID, plan));
const provider = new MeteredProvider();
const reference = await new LeadQualificationAgent(provider, { routineModel: "deepseek-v4-pro",
  escalationModel: "deepseek-v4-pro", batchSize: 3, concurrency: 6 })
  .evaluate(selected, playbook, "DE", "Germany", plan.objective);
const referenceById = new Map(reference.map((assessment) => [assessment.candidateId, assessment]));
const rows = adaptive.rows.map((row) => {
  const assessment = referenceById.get(row.candidateId);
  if (!assessment) throw new Error(`Reference omitted ${row.candidateId}`);
  return { ...row, referenceRole: assessment.primaryRole, roleAgreement: assessment.primaryRole === row.optimizedRole,
    referenceEligibility: assessment.eligibilityStatus,
    eligibilityAgreement: assessment.eligibilityStatus === row.optimizedEligibility,
    referenceScore: assessment.totalScore,
    absoluteScoreDifference: Math.abs(assessment.totalScore - row.optimizedScore),
    referenceCompleted: assessment.scoringStatus === "completed" };
});
const percent = (count: number) => Number((count / rows.length * 100).toFixed(1));
const mad = Number((rows.reduce((sum, row) => sum + row.absoluteScoreDifference, 0) / rows.length).toFixed(2));
const referenceTokens = provider.usage.reduce((sum, usage) => sum + usage.totalTokens, 0);
const previousOptimizedTokensPerCompany = 7_757_415 / 207;
const reductionVsPreviousOptimized = Number(((1 - adaptive.metrics.measuredTokensPerCompany
  / previousOptimizedTokensPerCompany) * 100).toFixed(1));
const metrics = { sampleSize: rows.length,
  completedPercent: percent(rows.filter((row) => row.completed && row.referenceCompleted).length),
  primaryRoleAgreementPercent: percent(rows.filter((row) => row.roleAgreement).length),
  eligibilityAgreementPercent: percent(rows.filter((row) => row.eligibilityAgreement).length),
  meanAbsoluteScoreDifference: mad,
  adaptiveTokens: adaptive.metrics.measuredModelTokens, referenceProTokens: referenceTokens,
  adaptiveTokensPerCompany: adaptive.metrics.measuredTokensPerCompany,
  previousOptimizedTokensPerCompany: Math.round(previousOptimizedTokensPerCompany),
  tokenReductionVsPreviousOptimizedPercent: reductionVsPreviousOptimized,
  tokenReductionVsOld81Percent: adaptive.metrics.tokenReductionVs81Percent,
  paidSearchReductionPercent: adaptive.metrics.paidSearchHistoricalActual.reductionPercent };
const gates = { completed: metrics.completedPercent === 100,
  primaryRole: metrics.primaryRoleAgreementPercent >= 97,
  eligibility: metrics.eligibilityAgreementPercent >= 97,
  scoreStability: metrics.meanAbsoluteScoreDifference <= 3,
  evidenceReferences: rows.every((row) => row.evidenceReferencesValid),
  pathPolicy: rows.every((row) => row.pathCount <= 2 && row.pathTaxonomyValid && row.pathConfidenceAbsent),
  tier1Ka: rows.every((row) => !row.tier1KaError),
  tokenTarget: metrics.tokenReductionVsPreviousOptimizedPercent >= 40,
  paidSearchTarget: metrics.paidSearchReductionPercent >= 30 };
const passed = Object.values(gates).every(Boolean);
const result = { schemaVersion: 1, method: "adaptive-flash-vs-all-pro-reference-on-identical-frozen-evidence",
  generatedAt: new Date().toISOString(), passed, metrics, gates, rows, referenceUsage: provider.usage };
await writeFile(path.join(outputRoot, "quality-reference.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(path.join(outputRoot, "quality-reference.md"), [
  "# v3 代表性 A/B：自适应 Flash 对全 Pro 参考",
  "",
  `- 结论：${passed ? "PASS" : "FAIL"}`,
  `- 样本：${metrics.sampleSize} 家，每类 1–2 家；两臂使用完全相同的冻结证据与 v3 Schema。`,
  `- 主角色一致率：${metrics.primaryRoleAgreementPercent}%；eligibility 一致率：${metrics.eligibilityAgreementPercent}%；MAD：${metrics.meanAbsoluteScoreDifference}。`,
  `- 自适应臂实际 token：${metrics.adaptiveTokens.toLocaleString("en-US")}；全 Pro 参考臂：${metrics.referenceProTokens.toLocaleString("en-US")}。`,
  `- 自适应臂 ${metrics.adaptiveTokensPerCompany.toLocaleString("en-US")} token/公司，相对上一轮 207 家优化实测 ${metrics.previousOptimizedTokensPerCompany.toLocaleString("en-US")} 降低 ${metrics.tokenReductionVsPreviousOptimizedPercent}%。`,
  `- 相对旧 81 家全流程基线降低 ${metrics.tokenReductionVsOld81Percent}%；付费检索历史实测降低 ${metrics.paidSearchReductionPercent}%。`,
  "",
  "| 公司 | 类别 | 自适应分 | Pro 参考分 | |Δ| | eligibility 一致 |",
  "|---|---|---:|---:|---:|---:|",
  ...rows.map((row) => `| ${row.companyName.replaceAll("|", "\\|")} | ${row.category} | ${row.optimizedScore} | ${row.referenceScore} | ${row.absoluteScoreDifference} | ${row.eligibilityAgreement ? "是" : "否"} |`),
  "",
].join("\n"), "utf8");
console.log(JSON.stringify({ passed, metrics, gates, outputRoot }, null, 2));
if (!passed) process.exitCode = 2;
