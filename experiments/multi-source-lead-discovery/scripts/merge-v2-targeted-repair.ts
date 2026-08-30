import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isCurrentLeadScoringEvidence } from "../../../src/lib/leads/evidence-snapshot";
import type {
  CorrectedLeadWorkflowCandidate,
  LeadAssessmentReview,
  LeadCandidateAssessment,
  LeadCandidateCorrection,
  LeadDevelopmentHandoff,
} from "../../../src/lib/leads/workflow/types";

interface CorrectionStage {
  runId: string;
  generatedAt: string;
  candidates: CorrectedLeadWorkflowCandidate[];
  creditsUsed: number;
  warnings: string[];
}

interface PrimaryStage {
  runId: string;
  generatedAt: string;
  assessments: LeadCandidateAssessment[];
}

interface Comparison extends Record<string, unknown> {
  dossierId: string;
  companyName: string;
  domain: string;
  oldV17Score: number | null;
  newV2Score: number;
  delta: number | null;
  primaryBusinessRole: string;
  companyScaleClass: string;
  researchDepth: string;
  accountTier: string;
  eligibilityStatus: string;
}

interface UsageRow {
  task: string;
  model: string;
  requests: number;
  successful: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  averageLatencyMs: number | null;
}

interface CostAnalysis {
  acquisition: { initialTavilyCredits: number; correctionTavilyCredits: number; totalTavilyCredits: number };
  modelUsage: UsageRow[];
  rates: Record<string, number | null>;
  estimatedUsd: { deepSeek: number | null; independentReview: number | null; total: number | null; status: string };
  mainCostDrivers: string[];
  costControls: string[];
}

interface AssessmentResult extends Record<string, unknown> {
  runId: string;
  generatedAt: string;
  freshnessAudit: Record<string, unknown>;
  costAnalysis: CostAnalysis;
  creditsUsed: number;
  comparisons: Comparison[];
  corrections: Array<{ candidateId: string; correction: LeadCandidateCorrection }>;
  assessments: LeadCandidateAssessment[];
  reviews: LeadAssessmentReview[];
  handoffs: LeadDevelopmentHandoff[];
  warnings: string[];
  targetedRepair?: { repairedAt: string; repairedCandidates: number; candidateIds: string[]; source: string };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function replaceBy<T>(base: T[], repair: T[], key: (item: T) => string): T[] {
  const repairs = new Map(repair.map((item) => [key(item), item]));
  const merged = base.map((item) => repairs.get(key(item)) ?? item);
  const baseKeys = new Set(base.map(key));
  return [...merged, ...repair.filter((item) => !baseKeys.has(key(item)))];
}

function combineUsage(rows: UsageRow[]): UsageRow[] {
  const groups = new Map<string, UsageRow[]>();
  for (const row of rows) groups.set(`${row.task}|${row.model}`, [...(groups.get(`${row.task}|${row.model}`) ?? []), row]);
  return [...groups.entries()].map(([key, items]) => {
    const [task, model] = key.split("|");
    const sum = (field: "requests" | "successful" | "failed" | "promptTokens" | "completionTokens" | "reasoningTokens" | "totalTokens") =>
      items.reduce((total, item) => total + item[field], 0);
    const latencyWeight = items.reduce((total, item) => total
      + (item.averageLatencyMs ?? 0) * item.requests, 0);
    const requests = sum("requests");
    return { task, model, requests, successful: sum("successful"), failed: sum("failed"),
      promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"),
      reasoningTokens: sum("reasoningTokens"), totalTokens: sum("totalTokens"),
      averageLatencyMs: requests > 0 ? Math.round(latencyWeight / requests) : null };
  }).sort((left, right) => left.task.localeCompare(right.task) || left.model.localeCompare(right.model));
}

const runId = process.argv.find((value) => value.startsWith("--run-id="))?.slice(9)
  ?? "2026-08-30-de-v2-fresh";
const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs", runId);
const baseRoot = path.join(runRoot, "role-aware-v2");
const repairRoot = path.join(runRoot, "role-aware-v2-repair");

const [baseCorrection, repairCorrection, basePrimary, repairPrimary, base, repair] = await Promise.all([
  readJson<CorrectionStage>(path.join(baseRoot, "corrected-candidates.json")),
  readJson<CorrectionStage>(path.join(repairRoot, "corrected-candidates.json")),
  readJson<PrimaryStage>(path.join(baseRoot, "primary-assessments.json")),
  readJson<PrimaryStage>(path.join(repairRoot, "primary-assessments.json")),
  readJson<AssessmentResult>(path.join(baseRoot, "assessment-results.json")),
  readJson<AssessmentResult>(path.join(repairRoot, "assessment-results.json")),
]);

const repairedIds = new Set(repair.assessments.map((assessment) => assessment.candidateId));
const repairedDomains = new Set(repair.comparisons.map((comparison) => comparison.domain));
const candidates = replaceBy(baseCorrection.candidates, repairCorrection.candidates, (candidate) => candidate.candidateId);
const assessments = replaceBy(base.assessments, repair.assessments, (assessment) => assessment.candidateId);
const reviews = replaceBy(base.reviews, repair.reviews, (review) => review.candidateId);
const comparisons = replaceBy(base.comparisons, repair.comparisons, (comparison) => comparison.dossierId)
  .sort((left, right) => right.newV2Score - left.newV2Score || left.companyName.localeCompare(right.companyName));
const corrections = replaceBy(base.corrections, repair.corrections, (item) => item.candidateId);
const handoffs = replaceBy(base.handoffs, repair.handoffs, (handoff) => handoff.provenance.candidateId);
const primaryAssessments = replaceBy(basePrimary.assessments, repairPrimary.assessments,
  (assessment) => assessment.candidateId);
const citedEvidenceIds = new Set([
  ...candidates.flatMap((candidate) => [candidate.correction.reliedEvidenceIds,
    ...candidate.correction.findings.map((finding) => finding.evidenceIds)].flat()),
  ...assessments.flatMap((assessment) => [assessment.evidenceIds,
    ...assessment.dimensionRationales.map((rationale) => rationale.evidenceIds),
    ...assessment.cooperationPaths.map((cooperationPath) => cooperationPath.evidenceIds)].flat()),
]);
const currentEvidence = candidates.flatMap((candidate) => candidate.evidence)
  .filter((item) => isCurrentLeadScoringEvidence(item, runId));
const currentEvidenceIds = new Set(currentEvidence.map((item) => item.id));
const rejectedCitedEvidenceIds = [...citedEvidenceIds].filter((id) => !currentEvidenceIds.has(id));
if (rejectedCitedEvidenceIds.length > 0) {
  throw new Error(`Targeted repair freshness audit rejected ${rejectedCitedEvidenceIds.length} evidence IDs.`);
}

const previouslyMerged = Boolean(base.targetedRepair);
const modelUsage = previouslyMerged ? base.costAnalysis.modelUsage
  : combineUsage([...base.costAnalysis.modelUsage, ...repair.costAnalysis.modelUsage]);
const costAnalysis: CostAnalysis = {
  ...base.costAnalysis,
  acquisition: previouslyMerged ? base.costAnalysis.acquisition : {
    initialTavilyCredits: base.costAnalysis.acquisition.initialTavilyCredits,
    correctionTavilyCredits: base.costAnalysis.acquisition.correctionTavilyCredits
      + repair.costAnalysis.acquisition.correctionTavilyCredits,
    totalTavilyCredits: base.costAnalysis.acquisition.totalTavilyCredits
      + repair.costAnalysis.acquisition.correctionTavilyCredits,
  },
  modelUsage,
  estimatedUsd: { ...base.costAnalysis.estimatedUsd,
    total: null, status: "estimated-process-cost; deployed gateway rate card not recorded in this run" },
};
const generatedAt = new Date().toISOString();
const freshnessAudit = {
  oldEvidenceUsedForScoring: 0,
  rejectedCitedEvidenceIds: [],
  currentScoringEvidence: currentEvidence.length,
  priorRunSeedsExcluded: candidates.flatMap((candidate) => candidate.evidence)
    .filter((item) => item.sourceType === "discovery" || item.evidenceRunId !== runId).length,
  invalidCurrentEvidenceRejected: candidates.flatMap((candidate) => candidate.evidence)
    .filter((item) => item.sourceType !== "discovery" && !isCurrentLeadScoringEvidence(item, runId)).length,
};
const result: AssessmentResult = {
  ...base, generatedAt, freshnessAudit, costAnalysis,
  creditsUsed: base.creditsUsed + repairCorrection.creditsUsed,
  comparisons, corrections, assessments, reviews, handoffs,
  warnings: [...base.warnings.filter((warning) => ![...repairedDomains].some((domain) => warning.includes(domain))
    && ![...repairedIds].some((candidateId) => warning.includes(candidateId))), ...repair.warnings],
  targetedRepair: { repairedAt: generatedAt, repairedCandidates: repairedIds.size,
    candidateIds: [...repairedIds], source: "schema-safe targeted rerun" },
};

await writeFile(path.join(baseRoot, "corrected-candidates.json"), `${JSON.stringify({ ...baseCorrection,
  generatedAt, candidates, creditsUsed: baseCorrection.creditsUsed + repairCorrection.creditsUsed,
  warnings: [...baseCorrection.warnings, ...repairCorrection.warnings] }, null, 2)}\n`, "utf8");
await writeFile(path.join(baseRoot, "primary-assessments.json"), `${JSON.stringify({ ...basePrimary,
  generatedAt, assessments: primaryAssessments }, null, 2)}\n`, "utf8");
await writeFile(path.join(baseRoot, "assessment-results.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

const comparisonRows = comparisons.map((item) => `| ${item.companyName.replaceAll("|", "\\|")} | ${item.oldV17Score ?? "—"} | ${item.newV2Score} | ${item.delta ?? "—"} | ${item.primaryBusinessRole} | ${item.companyScaleClass} | ${item.researchDepth} | ${item.accountTier} | ${item.eligibilityStatus} |`);
const usageRows = modelUsage.map((item) => `| ${item.task} | ${item.model} | ${item.requests} | ${item.successful} | ${item.failed} | ${item.promptTokens} | ${item.completionTokens} | ${item.reasoningTokens} | ${item.totalTokens} | ${item.averageLatencyMs ?? "—"} |`);
const reviewStatuses = [...new Set(reviews.map((review) => review.status))]
  .map((status) => `- ${status}: ${reviews.filter((review) => review.status === status).length}`);
const reviewFailed = reviews.filter((review) => review.status === "review-failed").length;
const targetedResearch = reviews.filter((review) => review.status === "targeted-research-required").length;
const primaryTechnicalFailures = primaryAssessments.filter((assessment) => assessment.scoringStatus === "retry-required").length;
const deepSeekTokenTotal = modelUsage.filter((item) => item.model.startsWith("deepseek"))
  .reduce((sum, item) => sum + item.totalTokens, 0);
const independentReviewTokenTotal = modelUsage.filter((item) => item.task.startsWith("lead-review-"))
  .reduce((sum, item) => sum + item.totalTokens, 0);
await writeFile(path.join(baseRoot, "comparison-report.md"), [
  "# Germany v1.7 → v2 fresh-evidence reassessment", "", `Run: ${runId}`, `Generated: ${generatedAt}`,
  `Targeted repair: ${repairedIds.size} candidates`, "", "## Evidence freshness audit", "",
  `- Old v1.7 evidence used for scoring: ${freshnessAudit.oldEvidenceUsedForScoring}`,
  `- Current-run scoring evidence: ${freshnessAudit.currentScoringEvidence}`,
  `- Prior-run/discovery seeds excluded: ${freshnessAudit.priorRunSeedsExcluded}`,
  `- Invalid current evidence rejected: ${freshnessAudit.invalidCurrentEvidenceRejected}`,
  "", "## Review outcomes", "", ...reviewStatuses,
  `- Primary scoring technical failures after targeted repair: ${primaryTechnicalFailures}`,
  `- Business cases requiring targeted research: ${targetedResearch}`,
  `- Independent-review failures: ${reviewFailed} (service timeout/quota failures remain explicit; valid primary assessments were retained)`,
  "", "## Comparison", "",
  "| Company | v1.7 | v2 | Δ | Primary role | Scale | Research | Account tier | Eligibility |",
  "|---|---:|---:|---:|---|---|---|---|---|", ...comparisonRows, "", "## Cost analysis", "",
  `- Initial Tavily credits: ${costAnalysis.acquisition.initialTavilyCredits}`,
  `- Correction-stage Tavily credits: ${costAnalysis.acquisition.correctionTavilyCredits}`,
  `- DeepSeek returned token usage: ${deepSeekTokenTotal}`,
  `- Independent-review returned token usage: ${independentReviewTokenTotal}`,
  `- Monetary estimate status: ${costAnalysis.estimatedUsd.status}`,
  "- Usage totals are the process-cost estimate; failed calls without returned usage are excluded.",
  "", "| Task | Model | Requests | Success | Failed | Input tokens | Output tokens | Reasoning tokens | Total tokens | Avg latency ms |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|", ...usageRows, "",
  "### Main cost drivers", "", ...costAnalysis.mainCostDrivers.map((item) => `- ${item}`), "",
  "### Cost controls", "", ...costAnalysis.costControls.map((item) => `- ${item}`), "",
].join("\n"), "utf8");

console.log(JSON.stringify({ runId, repairedCandidates: repairedIds.size, freshnessAudit,
  retryRequired: assessments.filter((assessment) => assessment.scoringStatus === "retry-required").length,
  outputRoot: baseRoot }, null, 2));
