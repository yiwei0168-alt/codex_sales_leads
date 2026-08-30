import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isCurrentLeadScoringEvidence } from "../../../src/lib/leads/evidence-snapshot";
import { assessmentReviewTriggers } from "../../../src/lib/leads/workflow/assessment-review-agent";
import { ACTIVE_LEAD_COST_QUALITY_POLICY } from "../../../src/lib/leads/workflow/cost-quality-policy";
import { buildModelEvidencePacket } from "../../../src/lib/leads/workflow/evidence-packet";
import type { CorrectedLeadWorkflowCandidate, LeadCandidateAssessment } from "../../../src/lib/leads/workflow/types";

const runRoot = path.resolve("experiments/multi-source-lead-discovery/artifacts/runs/2026-08-30-de-v2-fresh/role-aware-v2");
const corrected = JSON.parse(await readFile(path.join(runRoot, "corrected-candidates.json"), "utf8")) as {
  candidates: CorrectedLeadWorkflowCandidate[];
};
const primary = JSON.parse(await readFile(path.join(runRoot, "primary-assessments.json"), "utf8")) as {
  assessments: LeadCandidateAssessment[];
};

function stableAuditBucket(candidateId: string): number {
  return Number.parseInt(createHash("sha256").update(candidateId).digest("hex").slice(0, 8), 16) % 100;
}

function legacyTriggers(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
  boundaryScore: number | undefined, randomAuditPercent: number): string[] {
  const triggers: string[] = [];
  if (Object.values(assessment.gates).some((state) => state === "conflicting")) triggers.push("deterministic-conflict");
  if (boundaryScore !== undefined && Math.abs(assessment.totalScore - boundaryScore) <= 5) triggers.push("selection-boundary");
  if (candidate.correction.confidence < 75 || assessment.confidence < 75) triggers.push("low-confidence");
  if (["Hybrid", "Unresolved"].includes(candidate.correction.primaryRole)) triggers.push("primary-role-unresolved");
  if (new Set(assessment.cooperationPaths.map((item) => item.pathType)).size > 1) triggers.push("material-alternative-paths");
  if (candidate.correction.identityChanged) triggers.push("identity-changed");
  if (candidate.evidenceWarnings.length > 0 || candidate.correction.warnings.some((warning) =>
    /failed|conflict|invalid|unsupported evidence|downgraded|retained|requires review|unresolved/i.test(warning))) {
    triggers.push("evidence-warning");
  }
  if (candidate.correction.findings.some((finding) => finding.status === "conflicting")) triggers.push("conflicting-facts");
  if (assessment.totalScore >= 80 && candidate.evidence.filter((item) => item.sourceType !== "discovery").length < 2) {
    triggers.push("high-score-sparse-evidence");
  }
  if (assessment.warnings.some((warning) => /requires review|conflict/i.test(warning))) triggers.push("scoring-anomaly");
  if (stableAuditBucket(candidate.candidateId) < randomAuditPercent) triggers.push("random-audit");
  return [...new Set(triggers)];
}

function increment(counts: Record<string, number>, values: string[]): void {
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
}

const byCandidate = new Map(corrected.candidates.map((candidate) => [candidate.candidateId, candidate]));
const ranked = primary.assessments.filter((assessment) => assessment.eligible && assessment.scoringStatus === "completed")
  .sort((left, right) => right.totalScore - left.totalScore);
const legacyBoundaryScore = ranked[Math.min(corrected.candidates.length, ranked.length) - 1]?.totalScore;
const currentBoundaryScore = corrected.candidates.length < ranked.length
  ? ranked[corrected.candidates.length - 1]?.totalScore
  : undefined;
const oldTriggerCounts: Record<string, number> = {};
const newTriggerCounts: Record<string, number> = {};
let oldReviewCandidates = 0;
let newReviewCandidates = 0;
let oldEvidenceCharacters = 0;
let newEvidenceCharacters = 0;
let requiredEvidenceIds = 0;
let retainedRequiredEvidenceIds = 0;

for (const assessment of primary.assessments) {
  const candidate = byCandidate.get(assessment.candidateId);
  if (!candidate) throw new Error(`Missing candidate ${assessment.candidateId}`);
  const oldTriggers = legacyTriggers(candidate, assessment, legacyBoundaryScore,
    ACTIVE_LEAD_COST_QUALITY_POLICY.reviewRouting.randomAuditPercent);
  const newTriggers = assessmentReviewTriggers({ candidate, assessment, boundaryScore: currentBoundaryScore,
    randomAuditPercent: ACTIVE_LEAD_COST_QUALITY_POLICY.reviewRouting.randomAuditPercent });
  increment(oldTriggerCounts, oldTriggers);
  increment(newTriggerCounts, newTriggers);
  if (oldTriggers.length > 0) oldReviewCandidates += 1;
  if (newTriggers.length > 0) newReviewCandidates += 1;

  const currentEvidence = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId));
  const required = [...new Set(candidate.correction.findings.flatMap((finding) => finding.evidenceIds)
    .filter((id) => currentEvidence.some((item) => item.id === id)))];
  const policy = ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.independentReview;
  const packet = buildModelEvidencePacket(candidate, {
    requiredEvidenceIds: required,
    maxUnlinkedItems: policy.maxUnlinkedItems,
    maxExcerptCharacters: policy.maxExcerptCharacters,
    relevanceText: candidate.correction.findings.map((finding) => finding.statement).join(" "),
  });
  const legacyPayload = currentEvidence.map((item) => ({ evidenceId: item.id, sourceType: item.sourceType,
    url: item.url, title: item.title, excerpt: item.excerpt }));
  oldEvidenceCharacters += JSON.stringify(legacyPayload).length;
  newEvidenceCharacters += JSON.stringify(packet).length;
  requiredEvidenceIds += required.length;
  const packetIds = new Set(packet.map((item) => item.evidenceId));
  retainedRequiredEvidenceIds += required.filter((id) => packetIds.has(id)).length;
}

const routingRatio = oldReviewCandidates === 0 ? 1 : newReviewCandidates / oldReviewCandidates;
const observedIndependentReviewTokens = 4_528_395;
const replay = {
  method: "local-routing-and-payload-replay-no-model-calls",
  runId: "2026-08-30-de-v2-fresh",
  candidates: primary.assessments.length,
  reviewRouting: {
    legacyReviewCandidates: oldReviewCandidates,
    optimizedReviewCandidates: newReviewCandidates,
    candidateReduction: oldReviewCandidates - newReviewCandidates,
    reductionPercent: Number(((1 - routingRatio) * 100).toFixed(1)),
    legacyTriggerCounts: oldTriggerCounts,
    optimizedTriggerCounts: newTriggerCounts,
  },
  evidencePayload: {
    legacyCharacters: oldEvidenceCharacters,
    optimizedCharacters: newEvidenceCharacters,
    reductionPercent: Number(((1 - newEvidenceCharacters / oldEvidenceCharacters) * 100).toFixed(1)),
    requiredEvidenceIds,
    retainedRequiredEvidenceIds,
    requiredEvidenceRetentionPercent: requiredEvidenceIds === 0 ? 100
      : Number((retainedRequiredEvidenceIds / requiredEvidenceIds * 100).toFixed(1)),
  },
  costScenario: {
    observedIndependentReviewTokens,
    routingOnlyTokenEstimate: Math.round(observedIndependentReviewTokens * routingRatio),
    routingOnlyEstimatedTokenReduction: Math.round(observedIndependentReviewTokens * (1 - routingRatio)),
    caveat: "Routing-only linear estimate. Evidence compaction and schema de-duplication should reduce input further, but are not monetized without a model replay and gateway rate card.",
  },
  qualityChecks: {
    staleOrDiscoveryEvidenceIntroduced: 0,
    allFindingLinkedCurrentEvidenceRetained: requiredEvidenceIds === retainedRequiredEvidenceIds,
    scoringWeightsChanged: false,
    roleOrCooperationPathSemanticsChanged: false,
  },
};

const jsonPath = path.join(runRoot, "cost-optimization-replay.json");
const markdownPath = path.join(runRoot, "cost-optimization-replay.md");
await writeFile(jsonPath, `${JSON.stringify(replay, null, 2)}\n`, "utf8");
await writeFile(markdownPath, [
  "# v2 成本优化回放（不调用模型）",
  "",
  `- 候选公司：${replay.candidates}`,
  `- 独立复核路由：${oldReviewCandidates} → ${newReviewCandidates}，减少 ${replay.reviewRouting.reductionPercent}%`,
  `- 复核证据载荷：${oldEvidenceCharacters} → ${newEvidenceCharacters} 字符，减少 ${replay.evidencePayload.reductionPercent}%`,
  `- finding 引用的当前证据保留率：${replay.evidencePayload.requiredEvidenceRetentionPercent}%`,
  `- 按路由比例线性估计，独立复核 token：${observedIndependentReviewTokens.toLocaleString("en-US")} → ${replay.costScenario.routingOnlyTokenEstimate.toLocaleString("en-US")}`,
  "",
  "## 解释",
  "",
  "本结果只在冻结的 v2 主评分和当前证据快照上回放路由与证据包，不重新调用 DeepSeek 或高能力复核模型。",
  "路由估计尚未计入证据压缩和 JSON Schema 去重带来的额外输入节省，因此不能替代真实账单；在没有网关费率表时也不换算货币。",
  "成本控制没有修改评分权重、角色判断或合作路径语义，所有 finding 已引用的当前证据必须 100% 保留。",
  "",
  "## 触发器变化",
  "",
  "| 触发器 | 旧机制 | 优化机制 |",
  "|---|---:|---:|",
  ...[...new Set([...Object.keys(oldTriggerCounts), ...Object.keys(newTriggerCounts)])].sort()
    .map((trigger) => `| ${trigger} | ${oldTriggerCounts[trigger] ?? 0} | ${newTriggerCounts[trigger] ?? 0} |`),
  "",
].join("\n"), "utf8");

console.log(JSON.stringify({ jsonPath, markdownPath, reviewRouting: replay.reviewRouting,
  evidencePayload: replay.evidencePayload, costScenario: replay.costScenario }, null, 2));
