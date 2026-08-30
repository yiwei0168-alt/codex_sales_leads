import { createHash } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { DeepSeekProvider } from "@/providers/deepseek";

import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from "../scoring-policy";
import { isCurrentLeadScoringEvidence } from "../evidence-snapshot";
import { normalizeAssessment } from "./qualification-agent";
import { ACTIVE_LEAD_COST_QUALITY_POLICY } from "./cost-quality-policy";
import { buildModelEvidencePacket } from "./evidence-packet";
import {
  leadAssessmentJudgeSchema,
  leadAssessmentModelSchema,
  type LeadAssessmentModelOutput,
} from "./schemas";
import type {
  CorrectedLeadWorkflowCandidate,
  LeadAssessmentReview,
  LeadCandidateAssessment,
  LeadMarketPlaybook,
} from "./types";

const REVIEW_PROMPT_VERSION = "lead-blind-secondary-v2-role-aware";
const JUDGE_PROMPT_VERSION = "lead-disagreement-judge-v2-role-aware";

type JudgeOutput = typeof leadAssessmentJudgeSchema._output;

export interface LeadReviewInvoker {
  assess(input: Record<string, unknown>): Promise<{ output: LeadAssessmentModelOutput; model: string;
    usage?: LeadReviewUsage["usage"] }>;
  judge(input: Record<string, unknown>): Promise<{ output: JudgeOutput; model: string;
    usage?: LeadReviewUsage["usage"] }>;
}

export interface LeadReviewUsage {
  phase: "secondary" | "judge";
  model: string;
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number; totalTokens: number };
}

interface AssessmentReviewAgentOptions {
  secondaryModel?: string;
  judgeModel?: string;
  randomAuditPercent?: number;
  concurrency?: number;
}

function openAiClient(): OpenAI {
  const dedicatedKey = process.env.LEAD_REVIEW_API_KEY?.trim();
  const lingyuKey = process.env.LINGYU_API_KEY?.trim();
  const apiKey = dedicatedKey || lingyuKey || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("LEAD_REVIEW_API_KEY, LINGYU_API_KEY or OPENAI_API_KEY is required for independent lead review");
  const baseURL = process.env.LEAD_REVIEW_BASE_URL?.trim()
    || (lingyuKey && !dedicatedKey ? "https://lingyuapi.com/v1" : process.env.OPENAI_BASE_URL?.trim())
    || "https://api.openai.com/v1";
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 120_000,
    maxRetries: 2,
  });
}

class OpenAiLeadReviewInvoker implements LeadReviewInvoker {
  private client?: OpenAI;

  constructor(private readonly secondaryModel: string, private readonly judgeModel: string) {}

  private getClient(): OpenAI {
    this.client ??= openAiClient();
    return this.client;
  }

  async assess(input: Record<string, unknown>) {
    const response = await this.getClient().responses.parse({
      model: this.secondaryModel,
      store: false,
      reasoning: { effort: "medium" },
      instructions: [
        "Independently assess one Cudy sales lead from the frozen atomic fact ledger and public evidence.",
        "You are blind to the primary score and discovery provider. Do not infer missing facts.",
        "Use unknown for missing proof, not-supported only for affirmative contradiction, and conflicting for disagreement.",
        "Use role-specific customer and scenario criteria, best enabled product track, same-primary-role scale peers and every viable cooperation path.",
        "Return exactly seven evidence-linked dimension rationales and use only supplied current-run finding/evidence IDs.",
      ].join("\n"),
      input: JSON.stringify(input),
      text: { verbosity: "low", format: zodTextFormat(leadAssessmentModelSchema, "blind_lead_assessment") },
    });
    if (!response.output_parsed) throw new Error("OpenAI secondary reviewer returned no parsed assessment");
    return { output: response.output_parsed, model: response.model, usage: response.usage ? {
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? 0,
      totalTokens: response.usage.total_tokens,
    } : undefined };
  }

  async judge(input: Record<string, unknown>) {
    const response = await this.getClient().responses.parse({
      model: this.judgeModel,
      store: false,
      reasoning: { effort: "high" },
      instructions: [
        "Resolve a material disagreement between two anonymous lead assessments using only the frozen fact ledger.",
        "Do not assume A or B is primary. You may accept one, merge dimension judgments, or request one targeted research question.",
        "Never create a fact or evidence ID. Missing evidence remains unknown.",
      ].join("\n"),
      input: JSON.stringify(input),
      text: { verbosity: "low", format: zodTextFormat(leadAssessmentJudgeSchema, "lead_assessment_judgment") },
    });
    if (!response.output_parsed) throw new Error("OpenAI judge returned no parsed decision");
    return { output: response.output_parsed, model: response.model, usage: response.usage ? {
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? 0,
      totalTokens: response.usage.total_tokens,
    } : undefined };
  }
}

export class DeepSeekLeadReviewInvoker implements LeadReviewInvoker {
  constructor(
    private readonly provider: AiProvider = new DeepSeekProvider({ maxAttempts: 4 }),
    private readonly secondaryModel = process.env.DEEPSEEK_ESCALATION_MODEL?.trim() || "deepseek-v4-pro",
    private readonly judgeModel = process.env.DEEPSEEK_ESCALATION_MODEL?.trim() || "deepseek-v4-pro",
  ) {}

  async assess(input: Record<string, unknown>) {
    const response = await this.provider.execute<Record<string, unknown>, unknown>({
      task: "lead-review-secondary",
      modelVersion: this.secondaryModel,
      promptVersion: REVIEW_PROMPT_VERSION,
      evidenceIds: [],
      input: {
        instructions: [
          "Independently assess one Cudy sales lead from the frozen atomic fact ledger and public evidence.",
          "You are blind to the primary score and discovery provider. Do not infer missing facts.",
          "Use unknown for missing proof, not-supported only for affirmative contradiction, and conflicting for disagreement.",
          "Use role-specific customer and scenario criteria, best enabled product track, same-primary-role scale peers and every viable cooperation path.",
          "Return exactly seven evidence-linked dimension rationales and use only supplied current-run finding/evidence IDs.",
        ],
        payload: input,
      },
      outputSchema: z.toJSONSchema(leadAssessmentModelSchema) as Record<string, unknown>,
    }, AbortSignal.timeout(120_000));
    return { output: leadAssessmentModelSchema.parse(response.output), model: response.modelVersion,
      usage: response.usage ? { inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens, reasoningTokens: response.usage.reasoningTokens,
        totalTokens: response.usage.totalTokens } : undefined };
  }

  async judge(input: Record<string, unknown>) {
    const response = await this.provider.execute<Record<string, unknown>, unknown>({
      task: "lead-review-judge",
      modelVersion: this.judgeModel,
      promptVersion: JUDGE_PROMPT_VERSION,
      evidenceIds: [],
      input: {
        instructions: [
          "Resolve a material disagreement between two anonymous lead assessments using only the frozen fact ledger.",
          "Do not assume A or B is primary. Accept one, merge dimension judgments, or request one targeted research question.",
          "Never create a fact or evidence ID. Missing evidence remains unknown.",
        ],
        payload: input,
      },
      outputSchema: z.toJSONSchema(leadAssessmentJudgeSchema) as Record<string, unknown>,
    }, AbortSignal.timeout(120_000));
    return { output: leadAssessmentJudgeSchema.parse(response.output), model: response.modelVersion,
      usage: response.usage ? { inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens, reasoningTokens: response.usage.reasoningTokens,
        totalTokens: response.usage.totalTokens } : undefined };
  }
}

function stableAuditBucket(candidateId: string): number {
  return Number.parseInt(createHash("sha256").update(candidateId).digest("hex").slice(0, 8), 16) % 100;
}

export function assessmentReviewTriggers(options: {
  candidate: CorrectedLeadWorkflowCandidate;
  assessment: LeadCandidateAssessment;
  boundaryScore?: number;
  randomAuditPercent: number;
}): string[] {
  const { candidate, assessment, boundaryScore, randomAuditPercent } = options;
  const triggers: string[] = [];
  const routing = ACTIVE_LEAD_COST_QUALITY_POLICY.reviewRouting;
  const actionable = assessment.eligible || assessment.totalScore >= routing.actionableScoreThreshold
    || candidate.userNominated === true || ["Global/Enterprise", "National"].includes(assessment.companyScaleClass);
  if (Object.values(assessment.gates).some((state) => state === "conflicting")) triggers.push("deterministic-conflict");
  if (boundaryScore !== undefined && Math.abs(assessment.totalScore - boundaryScore) <= routing.selectionBoundaryPoints) {
    triggers.push("selection-boundary");
  }
  if (actionable && (candidate.correction.confidence < routing.lowConfidenceThreshold
    || assessment.confidence < routing.lowConfidenceThreshold)) triggers.push("low-confidence");
  if (candidate.correction.primaryRole === "Hybrid" || candidate.correction.primaryRole === "Unresolved") {
    triggers.push("primary-role-unresolved");
  }
  const rankedPaths = [...assessment.cooperationPaths].sort((left, right) => right.fitScore - left.fitScore);
  if (actionable && new Set(rankedPaths.map((path) => path.pathType)).size > 1 && rankedPaths[1]
    && rankedPaths[0].fitScore - rankedPaths[1].fitScore <= routing.materialPathFitGap) {
    triggers.push("material-alternative-paths");
  }
  if (actionable && candidate.correction.identityChanged) triggers.push("identity-changed");
  const materialCorrectionWarning = candidate.correction.warnings.some((warning) =>
    /failed|conflict|invalid|unsupported evidence|downgraded|retained|requires review|unresolved/i.test(warning));
  if (actionable && (candidate.evidenceWarnings.length > 0 || materialCorrectionWarning)) triggers.push("evidence-warning");
  if (candidate.correction.findings.some((finding) => finding.status === "conflicting")) triggers.push("conflicting-facts");
  const claimEvidenceCount = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId)).length;
  if (assessment.totalScore >= 80 && claimEvidenceCount < 2) triggers.push("high-score-sparse-evidence");
  const unresolvedScoringWarning = assessment.warnings.some((warning) =>
    !/^Routine (?:assessment requested|batch failed):?/i.test(warning)
    && /requires review|conflict/i.test(warning));
  if (actionable && unresolvedScoringWarning) {
    triggers.push("scoring-anomaly");
  }
  if (randomAuditPercent > 0 && stableAuditBucket(candidate.candidateId) < randomAuditPercent) triggers.push("random-audit");
  return [...new Set(triggers)];
}

function publicAssessment(assessment: LeadCandidateAssessment): LeadAssessmentModelOutput {
  return {
    candidateId: assessment.candidateId,
    gates: assessment.gates,
    eligibilityStatus: assessment.eligibilityStatus,
    companyScaleClass: assessment.companyScaleClass,
    researchDepth: assessment.researchDepth,
    supplyModel: assessment.supplyModel,
    brandInvolvement: assessment.brandInvolvement,
    cooperationPaths: assessment.cooperationPaths,
    selectedPathId: assessment.selectedPathId,
    dimensions: assessment.dimensions,
    dimensionRationales: assessment.dimensionRationales,
    confidence: assessment.confidence,
    summary: assessment.summary,
    reasons: assessment.reasons,
    risks: assessment.risks,
    unknowns: assessment.unknowns,
    evidenceIds: assessment.evidenceIds,
    needsEscalation: false,
    warnings: assessment.warnings,
  };
}

function responseFor(output: LeadAssessmentModelOutput, model: string, promptVersion: string): StructuredAiResponse<unknown> {
  return { output, modelVersion: model, promptVersion, latencyMs: 0, warnings: [] };
}

function materialDisagreements(primary: LeadCandidateAssessment, secondary: LeadCandidateAssessment): string[] {
  const disagreements: string[] = [];
  const routing = ACTIVE_LEAD_COST_QUALITY_POLICY.judgeRouting;
  for (const key of Object.keys(primary.gates) as Array<keyof typeof primary.gates>) {
    if (primary.gates[key] !== secondary.gates[key]) disagreements.push(`gate:${key}`);
  }
  if (primary.eligible !== secondary.eligible) disagreements.push("eligibility");
  const totalDifference = Math.abs(primary.totalScore - secondary.totalScore);
  if (totalDifference >= routing.totalScoreDifference) disagreements.push("total-score");
  if (primary.accountTier !== secondary.accountTier) disagreements.push("account-tier");
  const selectedPathType = (assessment: LeadCandidateAssessment) => assessment.cooperationPaths
    .find((path) => path.pathId === assessment.selectedPathId)?.pathType ?? null;
  if (selectedPathType(primary) !== selectedPathType(secondary)) disagreements.push("selected-path-type");
  const thresholds = routing.dimensionThresholds;
  for (const key of Object.keys(thresholds) as Array<keyof typeof thresholds>) {
    if (totalDifference >= routing.dimensionDifferenceRequiresTotalDifference
      && Math.abs(primary.dimensions[key] - secondary.dimensions[key]) >= thresholds[key]) {
      disagreements.push(`dimension:${key}`);
    }
  }
  return disagreements;
}

function evidencePayload(candidate: CorrectedLeadWorkflowCandidate) {
  const packetPolicy = ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.independentReview;
  const currentEvidenceIds = new Set(candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId)).map((item) => item.id));
  const currentFindings = candidate.correction.findings.flatMap((finding) => {
    const evidenceIds = finding.evidenceIds.filter((id) => currentEvidenceIds.has(id));
    return evidenceIds.length > 0 ? [{ ...finding, evidenceIds }] : [];
  });
  const evidence = buildModelEvidencePacket(candidate, {
    requiredEvidenceIds: currentFindings.flatMap((finding) => finding.evidenceIds),
    maxUnlinkedItems: packetPolicy.maxUnlinkedItems,
    maxExcerptCharacters: packetPolicy.maxExcerptCharacters,
    relevanceText: currentFindings.map((finding) => finding.statement).join(" "),
  });
  return {
    candidateId: candidate.candidateId,
    companyName: candidate.companyName,
    domain: candidate.domain,
    officialWebsiteUrl: candidate.officialWebsiteUrl,
    supportedRoles: candidate.correction.resolvedRoles,
    primaryBusinessRole: candidate.correction.primaryRole,
    possibleRoleFamilies: candidate.correction.resolvedFamilies,
    correctionConfidence: candidate.correction.confidence,
    findings: currentFindings,
    evidence: evidence.map((item) => ({
      evidenceId: item.evidenceId,
      sourceType: item.sourceType,
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      capturedAt: item.capturedAt,
      contentHash: item.contentHash,
      freshnessStatus: item.freshnessStatus,
      evidenceRunId: item.evidenceRunId,
    })),
  };
}

export class LeadAssessmentReviewAgent {
  private readonly invoker: LeadReviewInvoker;
  private readonly randomAuditPercent: number;
  private readonly concurrency: number;
  private usageRecords: LeadReviewUsage[] = [];

  constructor(invoker?: LeadReviewInvoker, options: AssessmentReviewAgentOptions = {}) {
    const secondaryModel = options.secondaryModel ?? process.env.LEAD_REVIEW_MODEL?.trim() ?? "gpt-5.6-terra";
    const judgeModel = options.judgeModel ?? process.env.LEAD_JUDGE_MODEL?.trim() ?? "gpt-5.6-sol";
    this.invoker = invoker ?? new OpenAiLeadReviewInvoker(secondaryModel, judgeModel);
    this.randomAuditPercent = Math.max(0, Math.min(100, options.randomAuditPercent
      ?? Number(process.env.LEAD_REVIEW_RANDOM_PERCENT ?? 5)));
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 2));
  }

  private async reviewOne(candidate: CorrectedLeadWorkflowCandidate, primary: LeadCandidateAssessment,
    playbook: LeadMarketPlaybook, plan: LeadSearchPlan, triggers: string[]) {
    try {
      const secondaryResult = await this.invoker.assess({
        market: { countryCode: plan.countryCode, countryName: plan.countryName, objective: plan.objective },
        cudyFitBrief: { marketHypothesis: playbook.marketHypothesis, productAngles: playbook.productAngles,
          preferredCompanyTraits: playbook.preferredCompanyTraits },
        scoringPolicy: { policyKey: ACTIVE_LEAD_SCORING_POLICY.policyKey,
          version: ACTIVE_LEAD_SCORING_POLICY.version, checksum: scoringPolicyChecksum(),
          weights: ACTIVE_LEAD_SCORING_POLICY.weights, roleScorecards: ACTIVE_LEAD_SCORING_POLICY.roleScorecards },
        candidate: evidencePayload(candidate),
      });
      if (secondaryResult.usage) this.usageRecords.push({ phase: "secondary",
        model: secondaryResult.model, usage: secondaryResult.usage });
      if (secondaryResult.output.candidateId !== candidate.candidateId) {
        throw new Error("Secondary reviewer returned a different candidateId");
      }
      const secondary = normalizeAssessment(secondaryResult.output, candidate,
        responseFor(secondaryResult.output, secondaryResult.model, REVIEW_PROMPT_VERSION), true);
      const disagreements = materialDisagreements(primary, secondary);
      if (disagreements.length === 0) {
        const review: LeadAssessmentReview = {
          candidateId: candidate.candidateId, required: true, triggers, status: "secondary-confirmed",
          primaryModel: primary.model, secondaryModel: secondaryResult.model,
          primaryScore: primary.totalScore, secondaryScore: secondary.totalScore, finalScore: primary.totalScore,
          materialDisagreements: [], rationale: "Blind secondary review found no material gate or score disagreement.", warnings: [],
        };
        return { assessment: primary, review };
      }

      const swap = stableAuditBucket(candidate.candidateId) % 2 === 1;
      const a = swap ? publicAssessment(secondary) : publicAssessment(primary);
      const b = swap ? publicAssessment(primary) : publicAssessment(secondary);
      const judgeResult = await this.invoker.judge({
        candidate: evidencePayload(candidate),
        materialDisagreements: disagreements,
        assessmentA: a,
        assessmentB: b,
      });
      if (judgeResult.usage) this.usageRecords.push({ phase: "judge",
        model: judgeResult.model, usage: judgeResult.usage });
      if (judgeResult.output.candidateId !== candidate.candidateId
        || judgeResult.output.assessment.candidateId !== candidate.candidateId) {
        throw new Error("Judge returned a different candidateId");
      }
      if (judgeResult.output.decision === "targeted-research") {
        const assessment = { ...primary, scoringStatus: "retry-required" as const,
          warnings: [...primary.warnings, `Judge requested targeted research: ${judgeResult.output.researchQuestion}`] };
        const review: LeadAssessmentReview = {
          candidateId: candidate.candidateId, required: true, triggers, status: "targeted-research-required",
          primaryModel: primary.model, secondaryModel: secondaryResult.model, judgeModel: judgeResult.model,
          primaryScore: primary.totalScore, secondaryScore: secondary.totalScore, finalScore: assessment.totalScore,
          materialDisagreements: disagreements, rationale: judgeResult.output.rationale,
          researchQuestion: judgeResult.output.researchQuestion, warnings: judgeResult.output.warnings,
        };
        return { assessment, review };
      }
      const judged = normalizeAssessment(judgeResult.output.assessment, candidate,
        responseFor(judgeResult.output.assessment, judgeResult.model, JUDGE_PROMPT_VERSION), true);
      const review: LeadAssessmentReview = {
        candidateId: candidate.candidateId, required: true, triggers, status: "judge-resolved",
        primaryModel: primary.model, secondaryModel: secondaryResult.model, judgeModel: judgeResult.model,
        primaryScore: primary.totalScore, secondaryScore: secondary.totalScore, finalScore: judged.totalScore,
        materialDisagreements: disagreements, rationale: judgeResult.output.rationale,
        warnings: judgeResult.output.warnings,
      };
      return { assessment: judged, review };
    } catch (error) {
      const severe = triggers.some((trigger) => ["deterministic-conflict", "identity-changed", "conflicting-facts",
        "primary-role-unresolved"].includes(trigger));
      const message = `Independent review failed: ${error instanceof Error ? error.message : String(error)}`;
      const assessment = severe ? { ...primary, scoringStatus: "retry-required" as const,
        warnings: [...primary.warnings, message] } : primary;
      const review: LeadAssessmentReview = {
        candidateId: candidate.candidateId, required: true, triggers, status: "review-failed",
        primaryModel: primary.model, primaryScore: primary.totalScore, finalScore: assessment.totalScore,
        materialDisagreements: [], rationale: "Primary assessment retained unless the unresolved trigger was severe.",
        warnings: [message],
      };
      return { assessment, review };
    }
  }

  async review(candidates: CorrectedLeadWorkflowCandidate[], assessments: LeadCandidateAssessment[],
    playbook: LeadMarketPlaybook, plan: LeadSearchPlan): Promise<{
      assessments: LeadCandidateAssessment[];
      reviews: LeadAssessmentReview[];
      usage?: LeadReviewUsage[];
      warnings: string[];
    }> {
    this.usageRecords = [];
    const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    const ranked = assessments.filter((assessment) => assessment.eligible && assessment.scoringStatus === "completed")
      .sort((left, right) => right.totalScore - left.totalScore);
    const boundaryScore = plan.targetCount < ranked.length ? ranked[plan.targetCount - 1]?.totalScore : undefined;
    const output = new Array<{ assessment: LeadCandidateAssessment; review: LeadAssessmentReview }>(assessments.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= assessments.length) return;
        const primary = assessments[index];
        const candidate = candidateById.get(primary.candidateId);
        if (!candidate) throw new Error(`Missing corrected candidate ${primary.candidateId} during assessment review`);
        const triggers = assessmentReviewTriggers({ candidate, assessment: primary, boundaryScore,
          randomAuditPercent: this.randomAuditPercent });
        if (triggers.length === 0) {
          output[index] = { assessment: primary, review: {
            candidateId: primary.candidateId, required: false, triggers: [], status: "not-required",
            primaryModel: primary.model, primaryScore: primary.totalScore, finalScore: primary.totalScore,
            materialDisagreements: [], rationale: "No deterministic review trigger fired.", warnings: [],
          } };
          continue;
        }
        output[index] = await this.reviewOne(candidate, primary, playbook, plan, triggers);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, assessments.length) }, worker));
    return {
      assessments: output.map((item) => item.assessment),
      reviews: output.map((item) => item.review),
      usage: [...this.usageRecords],
      warnings: output.flatMap((item) => item.review.warnings.map((warning) => `${item.review.candidateId}: ${warning}`)),
    };
  }
}
