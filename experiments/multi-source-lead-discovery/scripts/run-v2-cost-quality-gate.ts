import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "../../../src/providers/contracts";
import { DeepSeekProvider } from "../../../src/providers/deepseek";
import { OWNER_USER_ID } from "../../../src/lib/auth/config";
import { isCurrentLeadScoringEvidence } from "../../../src/lib/leads/evidence-snapshot";
import { LeadQualificationAgent } from "../../../src/lib/leads/workflow/qualification-agent";
import { retrieveLeadRagContext } from "../../../src/lib/leads/workflow/rag-context";
import { buildLeadMarketPlaybook } from "../../../src/lib/leads/workflow/playbook";
import type { LeadSearchPlan } from "../../../src/lib/assistant/types";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment,
  } from "../../../src/lib/leads/workflow/types";

const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-fresh/role-aware-v2");
const outputRoot = path.join(runRoot, "cost-quality-gate");
const strategicNames = ["Ingram Micro", "TD SYNNEX", "ALSO Deutschland", "Herweck", "WAVE", "ECOM"];
const representativeNames = [
  ...strategicNames,
  "Acondistec",
  "Controlware",
  "Bechtle",
  "CANCOM",
  "Kellner Telecom",
  "JACOB Elektronik",
  "Tiger Technik",
  "DNS:NET",
  "Vitel",
  "Solisation",
  "LaanTech",
  "Netzwerk-Arzt",
];

interface UsageRecord {
  task: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

class MeteredProvider implements AiProvider {
  readonly id = "metered-deepseek";
  readonly usage: UsageRecord[] = [];
  constructor(private readonly inner = new DeepSeekProvider()) {}
  isConfigured(): boolean { return this.inner.isConfigured(); }
  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal):
  Promise<StructuredAiResponse<TOutput>> {
    const response = await this.inner.execute<TInput, TOutput>(request, signal);
    if (response.usage) this.usage.push({ task: request.task, model: response.modelVersion,
      promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens,
      reasoningTokens: response.usage.reasoningTokens, totalTokens: response.usage.totalTokens });
    return response;
  }
}

function selectedPathType(assessment: LeadCandidateAssessment): string | null {
  return assessment.cooperationPaths.find((item) => item.pathId === assessment.selectedPathId)?.pathType ?? null;
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
const previousRun = await readFile(path.join(outputRoot, "optimized-assessments.json"), "utf8")
  .then((value) => JSON.parse(value) as { assessments: LeadCandidateAssessment[] }).catch(() => null);
const candidateByName = (needle: string) => candidates.find((candidate) =>
  candidate.companyName.toLocaleLowerCase("en").includes(needle.toLocaleLowerCase("en")));
const selected = representativeNames.map((name) => candidateByName(name)).filter((value): value is CorrectedLeadWorkflowCandidate => Boolean(value));
if (selected.length !== representativeNames.length) {
  const found = new Set(selected.map((candidate) => candidate.companyName));
  throw new Error(`Representative sample incomplete: expected ${representativeNames.length}, found ${found.size}`);
}
const baselineById = new Map(baselineAssessments.map((assessment) => [assessment.candidateId, assessment]));
const previousById = new Map((previousRun?.assessments ?? []).map((assessment) => [assessment.candidateId, assessment]));
const plan: LeadSearchPlan = { countryCode: "DE", countryName: "Germany", objective: "existing-distributor-growth",
  roles: ["Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer", "E-tailer", "SI", "Installer", "MSP", "ISP"],
  targetCount: selected.length, queryLanguage: "en",
  userRequest: "Reassess the preserved German v1.7 candidate pool using fresh evidence and role-aware Cudy fit." };
const rag = await retrieveLeadRagContext(OWNER_USER_ID, plan);
const playbook = await buildLeadMarketPlaybook(plan, rag);
await mkdir(outputRoot, { recursive: true });
const provider = new MeteredProvider();
if (!provider.isConfigured()) throw new Error("DEEPSEEK_API_KEY is required for the v2 cost-quality gate");
const optimized = await new LeadQualificationAgent(provider, {
  routineModel: "deepseek-v4-pro",
  escalationModel: "deepseek-v4-pro",
  batchSize: 2,
  concurrency: 8,
}).evaluate(selected, playbook, "DE", "Germany", plan.objective);
await writeFile(path.join(outputRoot, "optimized-assessments.json"), `${JSON.stringify({
  runId: "2026-08-30-de-v2-fresh", generatedAt: new Date().toISOString(), assessments: optimized,
  usage: provider.usage,
}, null, 2)}\n`, "utf8");

const rows = optimized.map((assessment) => {
  const baseline = baselineById.get(assessment.candidateId);
  const previous = previousById.get(assessment.candidateId);
  const candidate = selected.find((item) => item.candidateId === assessment.candidateId);
  if (!baseline || !candidate) throw new Error(`Missing baseline or candidate for ${assessment.candidateId}`);
  const currentEvidenceIds = new Set(candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId)).map((item) => item.id));
  const returnedIds = [...new Set([
    ...assessment.evidenceIds,
    ...assessment.dimensionRationales.flatMap((item) => item.evidenceIds),
    ...assessment.cooperationPaths.flatMap((item) => item.evidenceIds),
  ])];
  return {
    candidateId: assessment.candidateId,
    companyName: candidate.companyName,
    strategic: strategicNames.some((name) => candidate.companyName.toLocaleLowerCase("en").includes(name.toLocaleLowerCase("en"))),
    completed: assessment.scoringStatus === "completed",
    baselineRole: baseline.primaryRole,
    optimizedRole: assessment.primaryRole,
    roleAgreement: baseline.primaryRole === assessment.primaryRole,
    baselineEligibility: baseline.eligibilityStatus,
    optimizedEligibility: assessment.eligibilityStatus,
    eligibilityAgreement: baseline.eligibilityStatus === assessment.eligibilityStatus,
    baselineScore: baseline.totalScore,
    optimizedScore: assessment.totalScore,
    absoluteScoreDifference: Math.abs(baseline.totalScore - assessment.totalScore),
    previousOptimizedScore: previous?.totalScore ?? null,
    repeatAbsoluteScoreDifference: previous ? Math.abs(previous.totalScore - assessment.totalScore) : null,
    baselinePathType: selectedPathType(baseline),
    optimizedPathType: selectedPathType(assessment),
    selectedPathTypeAgreement: selectedPathType(baseline) === selectedPathType(assessment),
    validEvidenceReferences: returnedIds.every((id) => currentEvidenceIds.has(id)),
    oldEvidenceReferences: returnedIds.filter((id) => !currentEvidenceIds.has(id)),
  };
});
const completed = rows.filter((row) => row.completed);
const topCount = Math.min(10, rows.length);
const baselineTop = new Set([...rows].sort((left, right) => right.baselineScore - left.baselineScore)
  .slice(0, topCount).map((row) => row.candidateId));
const optimizedTop = new Set([...rows].sort((left, right) => right.optimizedScore - left.optimizedScore)
  .slice(0, topCount).map((row) => row.candidateId));
const topOverlap = [...baselineTop].filter((id) => optimizedTop.has(id)).length;
const previousTop = new Set([...rows].filter((row) => row.previousOptimizedScore !== null)
  .sort((left, right) => (right.previousOptimizedScore ?? 0) - (left.previousOptimizedScore ?? 0))
  .slice(0, topCount).map((row) => row.candidateId));
const repeatTopOverlap = [...previousTop].filter((id) => optimizedTop.has(id)).length;
const repeatRows = rows.filter((row) => row.repeatAbsoluteScoreDifference !== null);
const metrics = {
  sampleSize: rows.length,
  completedPercent: percent(completed.length, rows.length),
  strategicCandidateRecallPercent: percent(rows.filter((row) => row.strategic && row.completed).length,
    rows.filter((row) => row.strategic).length),
  primaryRoleAgreementPercent: percent(rows.filter((row) => row.roleAgreement).length, rows.length),
  eligibilityAgreementPercent: percent(rows.filter((row) => row.eligibilityAgreement).length, rows.length),
  selectedPathTypeAgreementPercent: percent(rows.filter((row) => row.selectedPathTypeAgreement).length, rows.length),
  topN: topCount,
  topNOverlapPercent: percent(topOverlap, topCount),
  meanAbsoluteScoreDifference: Number((rows.reduce((sum, row) => sum + row.absoluteScoreDifference, 0) / rows.length).toFixed(2)),
  repeatReferenceAvailable: repeatRows.length === rows.length,
  repeatTopNOverlapPercent: percent(repeatTopOverlap, topCount),
  repeatMeanAbsoluteScoreDifference: repeatRows.length === 0 ? null : Number((repeatRows.reduce(
    (sum, row) => sum + (row.repeatAbsoluteScoreDifference ?? 0), 0) / repeatRows.length).toFixed(2)),
  validEvidenceReferencePercent: percent(rows.filter((row) => row.validEvidenceReferences).length, rows.length),
  oldEvidenceUsedForScoring: rows.reduce((sum, row) => sum + row.oldEvidenceReferences.length, 0),
  modelRequests: provider.usage.length,
  modelTokens: provider.usage.reduce((sum, item) => sum + item.totalTokens, 0),
};
const gates = {
  completed: metrics.completedPercent === 100,
  strategicRecall: metrics.strategicCandidateRecallPercent === 100,
  primaryRole: metrics.primaryRoleAgreementPercent >= 97,
  eligibility: metrics.eligibilityAgreementPercent >= 97,
  repeatReference: metrics.repeatReferenceAvailable,
  topN: metrics.repeatTopNOverlapPercent >= 90,
  scoreStability: metrics.repeatMeanAbsoluteScoreDifference !== null
    && metrics.repeatMeanAbsoluteScoreDifference <= 3,
  evidenceReferences: metrics.validEvidenceReferencePercent === 100 && metrics.oldEvidenceUsedForScoring === 0,
  selectedPathTypeDiagnosticOnly: metrics.selectedPathTypeAgreementPercent,
};
const passed = Object.entries(gates).filter(([key]) => key !== "selectedPathTypeDiagnosticOnly")
  .every(([, value]) => value === true);
const result = { schemaVersion: 1, runId: "2026-08-30-de-v2-fresh", mode: "tool-leaderboard-lead-value",
  generatedAt: new Date().toISOString(), passed, blockingGatesExcludeCooperationPath: true, metrics, gates, rows };
await writeFile(path.join(outputRoot, "quality-gate.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(path.join(outputRoot, "quality-gate.md"), [
  "# v2 成本优化质量门禁",
  "",
  `- 结论：${passed ? "PASS" : "FAIL"}`,
  `- 样本：${metrics.sampleSize} 家；战略候选召回：${metrics.strategicCandidateRecallPercent}%`,
  `- 主角色一致率：${metrics.primaryRoleAgreementPercent}%`,
  `- eligibility 一致率：${metrics.eligibilityAgreementPercent}%`,
  `- Top-${metrics.topN} 重合率：${metrics.topNOverlapPercent}%`,
  `- 相对历史结果 Top-${metrics.topN} 重合率：${metrics.topNOverlapPercent}%（诊断）`,
  `- 相对历史结果平均绝对分差：${metrics.meanAbsoluteScoreDifference}（诊断）`,
  `- 优化流程重复运行 Top-${metrics.topN} 重合率：${metrics.repeatTopNOverlapPercent}%`,
  `- 优化流程重复运行平均绝对分差：${metrics.repeatMeanAbsoluteScoreDifference ?? "无参考运行"}`,
  `- 有效证据引用率：${metrics.validEvidenceReferencePercent}%；旧证据引用：${metrics.oldEvidenceUsedForScoring}`,
  `- 合作路径类型一致率：${metrics.selectedPathTypeAgreementPercent}%（本轮工具排行榜仅评线索价值，作为诊断项而非阻断项）`,
  `- 模型请求：${metrics.modelRequests}；模型 token：${metrics.modelTokens}`,
  "",
  "| 公司 | 主角色 | baseline | optimized | |Δ| | eligibility | 路径一致 |",
  "|---|---|---:|---:|---:|---|---:|",
  ...rows.map((row) => `| ${row.companyName.replaceAll("|", "\\|")} | ${row.optimizedRole} | ${row.baselineScore} | ${row.optimizedScore} | ${row.absoluteScoreDifference} | ${row.optimizedEligibility} | ${row.selectedPathTypeAgreement ? "是" : "否"} |`),
  "",
].join("\n"), "utf8");
console.log(JSON.stringify({ passed, metrics, gates, outputRoot }, null, 2));
if (!passed) process.exitCode = 2;
