import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { createLeadAiProvider } from "@/providers/resilient-ai";
import { z } from "zod";

import { candidateValueScore, clampDimension, recommendationPriority, salesAccountTier, selectResearchDepth } from "../candidate-value";
import { isCurrentLeadScoringEvidence } from "../evidence-snapshot";
import { COOPERATION_PATH_POLICY, assessCooperationPathEvidence, type CooperationLane } from "../cooperation-path";
import { LEAD_EVIDENCE_SOURCE_POLICY, assessLeadEvidenceQuality } from "../evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../networking-relevance";
import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from "../scoring-policy";
import { ACTIVE_LEAD_COST_QUALITY_POLICY } from "./cost-quality-policy";
import { buildModelEvidencePacket } from "./evidence-packet";
import { leadAssessmentBatchSchema, leadAssessmentModelSchema, leadAssessmentScoreOnlyBatchSchema,
  leadAssessmentScoreOnlyModelSchema, type LeadAssessmentModelOutput,
  type LeadAssessmentScoreOnlyModelOutput } from "./schemas";
import type {
  LeadCandidateAssessment,
  CorrectedLeadWorkflowCandidate,
  LeadMarketPlaybook,
  WorkflowModelUsage,
} from "./types";

export const LEAD_QUALIFICATION_PROMPT_VERSION = "lead-value-v5-role-aware-five-paths";
export const LEAD_SCORE_ONLY_PROMPT_VERSION = "lead-value-v6-role-aware-score-only";
type QualificationModelOutput = LeadAssessmentModelOutput | LeadAssessmentScoreOnlyModelOutput;

interface LeadAssessmentRequest {
  instructions: string[];
  market: { countryCode: string; countryName: string; objective: string };
  cudyFitBrief: {
    marketHypothesis: string;
    productAngles: string[];
    preferredCompanyTraits: string[];
    ragCitationIds: string[];
    cooperationPathMemory: LeadMarketPlaybook["cooperationPathMemory"];
  };
  candidates: Array<{
    candidateId: string;
    companyName: string;
    domain: string;
    resolvedRoles: string[];
    resolvedRoleFamilies: string[];
    primaryBusinessRole: string;
    correctionReasons: string[];
    correctionConfidence: number;
    findings: CorrectedLeadWorkflowCandidate["correction"]["findings"];
    evidence: Array<{ evidenceId: string; sourceType: string; url: string; title: string; excerpt: string }>;
  }>;
  scoringRubric: Record<string, unknown>;
}

interface LeadQualificationAgentOptions {
  routineModel?: string;
  escalationModel?: string;
  batchSize?: number;
  maxBatchInputCharacters?: number;
  concurrency?: number;
  includeCooperationPaths?: boolean;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, Math.round(value)));
}

function normalizedPathFit(path: LeadAssessmentModelOutput["cooperationPaths"][number]) {
  const fitComponents = {
    roleStructureFit: clamp(path.fitComponents.roleStructureFit, 30),
    userStageAndSupplyFit: clamp(path.fitComponents.userStageAndSupplyFit, 25),
    productCustomerScenarioFit: clamp(path.fitComponents.productCustomerScenarioFit, 20),
    procurementAndInfluence: clamp(path.fitComponents.procurementAndInfluence, 15),
    executionFeasibility: clamp(path.fitComponents.executionFeasibility, 10),
  };
  return { fitComponents, fitScore: Object.values(fitComponents).reduce((sum, score) => sum + score, 0) };
}

function corroboratedGate(modelState: LeadAssessmentModelOutput["gates"][keyof LeadAssessmentModelOutput["gates"]],
  demonstrated: boolean) {
  if (modelState === "supported") return demonstrated ? "supported" as const : "conflicting" as const;
  if (modelState === "not-supported" && demonstrated) return "conflicting" as const;
  return modelState;
}

function cooperationLane(lane: CorrectedLeadWorkflowCandidate["queryFamily"]): CooperationLane {
  if (lane === "distribution") return "tier1-distribution";
  if (lane === "resale" || lane === "retail") return "b2b-resale";
  if (lane === "services") return "project-services";
  return "operator";
}

function pathRoleCompatible(path: LeadAssessmentModelOutput["cooperationPaths"][number]): boolean {
  const tier1Role = path.candidateRole === "Distributor" || path.candidateRole === "VAD";
  if (path.pathType === "Direct Tier-1 Supply") return tier1Role;
  if (path.pathType === "Distributor-Mediated Supply" || path.pathType === "Direct Downstream Channel Supply") {
    return !tier1Role;
  }
  return true;
}

export function normalizeAssessment(
  value: QualificationModelOutput,
  candidate: CorrectedLeadWorkflowCandidate,
  response: StructuredAiResponse<unknown>,
  escalated: boolean,
  allowOemOdm = false,
  includeCooperationPaths = true,
): LeadCandidateAssessment {
  const currentScoringEvidence = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId));
  const allowedEvidence = new Set(currentScoringEvidence.map((item) => item.id));
  const evidenceIds = [...new Set(value.evidenceIds.filter((id) => allowedEvidence.has(id)))];
  const claimEvidence = currentScoringEvidence;
  const claimEvidenceText = claimEvidence.flatMap((item) => [item.title, item.excerpt]);
  const networkingEvidence = assessNetworkingRelevanceEvidence(claimEvidenceText);
  const evidenceQuality = assessLeadEvidenceQuality({
    candidateDomain: candidate.domain,
    officialUrl: candidate.officialWebsiteUrl,
    evidence: candidate.evidence,
  });
  const pathEvidenceAssessments = (candidate.correction.resolvedFamilies.length > 0
    ? candidate.correction.resolvedFamilies : [candidate.queryFamily])
    .map((family) => assessCooperationPathEvidence({ lane: cooperationLane(family), evidence: claimEvidenceText }));
  const pathEvidenceAssessment = pathEvidenceAssessments.sort((left, right) => right.cap - left.cap)[0];
  const gates = {
    ...value.gates,
    correctedIdentityUsable: corroboratedGate(value.gates.correctedIdentityUsable,
      Boolean(candidate.companyName && candidate.domain) && evidenceQuality.identityConsistent),
    networkingRelevant: corroboratedGate(value.gates.networkingRelevant, networkingEvidence.demonstrated),
  };
  const dimensions = {
    productFamilyMatch: clampDimension("productFamilyMatch", value.dimensions.productFamilyMatch),
    customerAndScenarioOverlap: clampDimension("customerAndScenarioOverlap", value.dimensions.customerAndScenarioOverlap),
    positioningCompatibility: clampDimension("positioningCompatibility", value.dimensions.positioningCompatibility),
    cooperationPathAndBuyingInfluence: clampDimension("cooperationPathAndBuyingInfluence", value.dimensions.cooperationPathAndBuyingInfluence),
    scaleAndChannelCoverage: clampDimension("scaleAndChannelCoverage", value.dimensions.scaleAndChannelCoverage),
    executionAndEnablement: clampDimension("executionAndEnablement", value.dimensions.executionAndEnablement),
    opportunityAndRisk: clampDimension("opportunityAndRisk", value.dimensions.opportunityAndRisk),
  };
  const allowedRoles = new Set(candidate.correction.resolvedRoles);
  const allowedFindings = new Set(candidate.correction.findings.map((finding) => finding.findingId));
  const modelPaths = "cooperationPaths" in value ? value.cooperationPaths : [];
  const selectedPathId = "selectedPathId" in value ? value.selectedPathId : null;
  const rankedPaths = modelPaths
    .filter((path) => allowedRoles.has(path.candidateRole))
    .filter(pathRoleCompatible)
    .filter((path) => allowOemOdm || path.pathType !== "OEM/ODM")
    .map((path) => ({ ...path, ...normalizedPathFit(path),
      findingIds: [...new Set(path.findingIds.filter((id) => allowedFindings.has(id)))],
      evidenceIds: [...new Set(path.evidenceIds.filter((id) => allowedEvidence.has(id)))],
    }))
    .sort((left, right) => right.fitScore - left.fitScore || left.pathId.localeCompare(right.pathId))
    .slice(0, 2)
    .map((path, index) => ({ ...path, rank: index + 1 }));
  const qualifiedPaths = rankedPaths.filter((path) => path.fitScore >= 65);
  const cooperationPaths = qualifiedPaths.length > 0 ? qualifiedPaths : rankedPaths.slice(0, 1);
  const selectedPath = cooperationPaths.find((path) => path.pathId === selectedPathId) ?? cooperationPaths[0];
  const hasNotSupportedGate = Object.values(gates).some((state) => state === "not-supported");
  const hasUnresolvedGate = Object.values(gates).some((state) => state !== "supported");
  const sizeFinding = candidate.correction.findings.some((finding) => finding.kind === "company-size"
    && finding.status === "supported" && finding.evidenceIds.length > 0);
  const companyScaleClass = sizeFinding ? value.companyScaleClass : "Unknown";
  const researchDepth = selectResearchDepth({ scaleClass: companyScaleClass,
    strongRelevanceSignal: networkingEvidence.demonstrated, userNominated: candidate.userNominated ?? false,
    hasConflict: candidate.correction.findings.some((finding) => finding.status === "conflicting") });
  const eligibilityStatus = hasNotSupportedGate ? "ineligible-for-current-task" as const
    : hasUnresolvedGate || (includeCooperationPaths && cooperationPaths.length === 0)
      ? researchDepth === "limited" && value.eligibilityStatus === "insufficient-evidence-for-recommendation"
        ? "insufficient-evidence-for-recommendation" as const : "research-required" as const
      : "eligible" as const;
  const eligible = eligibilityStatus === "eligible";
  const totalScore = candidateValueScore(dimensions);
  const uncertainty = Math.max(2, Math.round((100 - clamp(value.confidence, 100)) * 0.15
    + Math.min(5, value.unknowns.length)));
  const scoreRange = { lower: Math.max(0, totalScore - uncertainty), upper: Math.min(100, totalScore + uncertainty) };
  const priority = recommendationPriority(totalScore, eligibilityStatus);
  const accountTier = salesAccountTier({ score: totalScore,
    scaleAndChannelCoverage: dimensions.scaleAndChannelCoverage,
    cooperationPathAndBuyingInfluence: dimensions.cooperationPathAndBuyingInfluence,
    selectedPath, primaryRole: candidate.correction.primaryRole,
    eligibilityStatus, scaleClass: companyScaleClass });
  const roles = candidate.correction.resolvedRoles;
  const primaryRole = candidate.correction.primaryRole;
  const supplyModel = ["Distributor Supply", "Brand Direct", "Co-sell/Co-supply", "TBD"].includes(value.supplyModel)
    ? value.supplyModel as LeadCandidateAssessment["supplyModel"] : "TBD";
  const brandInvolvement = ["Light", "Standard", "Deep"].includes(value.brandInvolvement)
    ? value.brandInvolvement as LeadCandidateAssessment["brandInvolvement"] : "Standard";
  const dimensionRationales = value.dimensionRationales.map((rationale) => ({
    ...rationale,
    score: dimensions[rationale.dimension],
    findingIds: [...new Set(rationale.findingIds.filter((id) => allowedFindings.has(id)))],
    evidenceIds: [...new Set(rationale.evidenceIds.filter((id) => allowedEvidence.has(id)))],
    confidence: clamp(rationale.confidence, 100),
  }));
  return {
    candidateId: candidate.candidateId,
    eligible,
    gates,
    roles,
    primaryRole,
    companyScaleClass,
    researchDepth,
    recommendationPriority: priority,
    accountTier,
    evidenceProfileAssessment: evidenceQuality.smallLongTail,
    supplyModel,
    brandInvolvement,
    dimensions,
    dimensionRationales,
    totalScore,
    scoreRange,
    confidence: clamp(value.confidence, 100),
    eligibilityStatus,
    cooperationPaths,
    selectedPathId: selectedPath?.pathId ?? null,
    summary: value.summary,
    reasons: value.reasons,
    risks: value.risks,
    unknowns: value.unknowns,
    evidenceIds,
    model: response.modelVersion,
    promptVersion: response.promptVersion,
    escalated,
    scoringStatus: "completed",
    warnings: [...response.warnings, ...value.warnings,
      ...(value.gates.networkingRelevant === "supported" && !networkingEvidence.demonstrated
        ? [`Networking evidence conflicts with the model gate: ${networkingEvidence.reason}`] : []),
      ...(value.gates.correctedIdentityUsable === "supported" && !evidenceQuality.identityConsistent
        ? [`Corrected identity evidence conflicts with the model gate: ${evidenceQuality.reason}`] : []),
      ...(!evidenceQuality.sufficient ? [`Evidence remains sparse: ${evidenceQuality.reason}`] : []),
      ...(value.dimensions.cooperationPathAndBuyingInfluence > pathEvidenceAssessment.cap * 3
        ? [`Cooperation-path model score exceeds the deterministic evidence signal of ${(pathEvidenceAssessment.cap * 3).toFixed(1)}/15 and requires review: ${pathEvidenceAssessment.reason}`] : []),
      ...(includeCooperationPaths && cooperationPaths.length < modelPaths.length
        ? ["Cooperation paths with unsupported roles, disabled OEM/ODM, or invalid evidence were removed."] : []),
      ...(evidenceIds.length < value.evidenceIds.length ? ["Model returned unsupported evidence IDs; they were removed."] : [])],
  };
}

function requiresEscalation(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
  value: QualificationModelOutput): boolean {
  const hasCriticalStateChange = value.escalation.criticalStateChanges.length > 0;
  return value.escalation.required && value.escalation.higherCapabilityCanResolve
    && (value.escalation.expectedTotalScoreChange >= 8 || hasCriticalStateChange);
}

function failedAssessment(candidate: CorrectedLeadWorkflowCandidate, message: string, promptVersion: string): LeadCandidateAssessment {
  return {
    candidateId: candidate.candidateId,
    eligible: false,
    gates: {
      correctedIdentityUsable: "unknown",
      companyExists: "unknown",
      targetCountryPresence: "unknown",
      networkingRelevant: "unknown",
      independentProspect: "unknown",
    },
    roles: candidate.correction.resolvedRoles,
    primaryRole: candidate.correction.primaryRole,
    companyScaleClass: "Unknown",
    researchDepth: "standard",
    recommendationPriority: "Hold/Research Required",
    accountTier: "Standard",
    evidenceProfileAssessment: {
      profile: "standard", confidence: "none", exceptionEligible: false,
      directSizeSignals: [], structuralSignals: [], longTailSignals: [], largeCompanyOverrides: [],
      reason: "Evidence assessment did not complete.",
    },
    supplyModel: "TBD",
    brandInvolvement: "Standard",
    dimensions: {
      productFamilyMatch: 0,
      customerAndScenarioOverlap: 0,
      positioningCompatibility: 0,
      cooperationPathAndBuyingInfluence: 0,
      scaleAndChannelCoverage: 0,
      executionAndEnablement: 0,
      opportunityAndRisk: 0,
    },
    dimensionRationales: [],
    totalScore: 0,
    scoreRange: { lower: 0, upper: 100 },
    confidence: 0,
    eligibilityStatus: "research-required",
    cooperationPaths: [],
    selectedPathId: null,
    summary: "The independent qualification agent did not produce a valid evidence-grounded assessment.",
    reasons: ["Candidate was not published because automated evidence assessment failed."],
    risks: ["Requires a later evidence and model retry."],
    unknowns: ["Company identity", "Target-market presence", "Channel role", "Cudy product fit"],
    evidenceIds: [],
    model: "unavailable",
    promptVersion,
    escalated: false,
    scoringStatus: "retry-required",
    warnings: [message],
  };
}

export class LeadQualificationAgent {
  private readonly routineModel: string;
  private readonly escalationModel: string;
  private readonly batchSize: number;
  private readonly maxBatchInputCharacters: number;
  private readonly concurrency: number;
  private readonly includeCooperationPaths: boolean;

  constructor(private readonly provider: AiProvider = createLeadAiProvider(), options: LeadQualificationAgentOptions = {}) {
    this.routineModel = options.routineModel ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.escalationModel = options.escalationModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.batchSize = Math.max(1, Math.min(5, options.batchSize ?? 5));
    this.maxBatchInputCharacters = Math.max(10_000, options.maxBatchInputCharacters
      ?? ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.qualification.maxBatchInputCharacters);
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 2));
    this.includeCooperationPaths = options.includeCooperationPaths ?? true;
  }

  private get promptVersion(): string {
    return this.includeCooperationPaths ? LEAD_QUALIFICATION_PROMPT_VERSION : LEAD_SCORE_ONLY_PROMPT_VERSION;
  }

  private request(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string) {
    const pathInstructions = this.includeCooperationPaths ? [
      "Return at most two evidence-supported cooperation paths using only: Direct Tier-1 Supply, Distributor-Mediated Supply, Direct Downstream Channel Supply, OEM/ODM, or Other.",
      "Score each path semantically with role/structure 0-30, user-stage/supply fit 0-25, product/customer/scenario fit 0-20, procurement/influence 0-15, and execution feasibility 0-10. Do not return a path total or path confidence; code computes and ranks the total.",
      "Normally recommend paths scoring at least 65. If every path is below 65, code retains only the highest path. Keep path explanations short; later strategy and email agents add titles, value propositions and calls to action only after explicit user action.",
      "Do not use an upward channel hierarchy. The recommended path depends on the user stage, market, product track, candidate roles and evidence.",
      "Use supplied private cooperation-path memory as a higher-priority user preference for analogous contexts, never as an objective company fact or score evidence. Request escalation when it conflicts with current evidence.",
      "OEM/ODM is disabled unless the task objective explicitly asks for OEM, ODM, private label or manufacturing cooperation.",
    ] : [
      "This is a scoring-only task. Do not generate cooperation paths, path IDs, a selected path, development strategy, email content or contacts.",
      "Score cooperationPathAndBuyingInfluence directly from the primary role's evidenced ability to select, procure, specify, resell or influence networking products; an explicit generated path is not required for eligibility.",
    ];
    const input: LeadAssessmentRequest = {
      instructions: [
        `Act as an independent role-aware sales-lead qualification${this.includeCooperationPaths ? " and cooperation-path" : ""} agent. Ignore provider scores, discovery order and the original search lane.`,
        "Assess only supplied current-run evidence. Never invent company facts, roles, scale, product fit, relationships, paths or evidence IDs.",
        "Treat old-run or discovery-only material as a search lead, never as scoring evidence unless it was freshly acquired or revalidated into this run.",
        "Every gate is supported, not-supported, unknown or conflicting. Failed acquisition and missing evidence are unknown, never a negative fact.",
        "Use the candidate's primary business role for scale peer comparison and for role-specific customer, scenario, positioning and execution criteria.",
        "Product family fit uses the best enabled product track, not average coverage of every Cudy family. Full-portfolio breadth applies only when the task explicitly requests a full-line master distributor.",
        "A broadline distributor is not diluted by unrelated categories. A focused SMB specialist is not penalized for lacking home, ISP or industrial families.",
        "Selling competitor brands is normally positive category evidence. Penalize only evidenced exclusivity, hard vendor lock-in, direct own-brand conflict, refusal or lack of entry space.",
        ...pathInstructions,
        "For very large or strategically important companies, request deep research when relevant business-unit or regional evidence is incomplete. For a positively identified small weak-signal long-tail company, limited research may end as insufficient-evidence-for-recommendation.",
        "Return exactly one evidence-linked rationale for each of the seven scoring dimensions. Evidence confidence is reported separately and has zero score weight.",
        "Product and use-case fit is 50 points: product family 25, customer/scenario 15, positioning 10. Other dimensions are path/influence 15, same-role scale/coverage 15, execution/enablement 10, opportunity/risk 10.",
        "Use current task fit for eligibility. No company-size gate exists. A small specialist with direct scenario evidence remains eligible.",
        "KA is never a tier-1 distributor label. Account tier and recommendation priority are computed deterministically after your assessment and must not influence dimension scores.",
        "Return one assessment for every candidateId. Request escalation only when a higher-capability model can resolve the issue and is expected to change total score by at least 8 points or change a critical identity, eligibility, primary-role, existence, country-presence or networking-relevance state. Top-N position and confidence alone never justify escalation.",
      ],
      market: { countryCode, countryName, objective },
      cudyFitBrief: {
        marketHypothesis: playbook.marketHypothesis,
        productAngles: playbook.productAngles,
        preferredCompanyTraits: playbook.preferredCompanyTraits,
        ragCitationIds: playbook.ragCitationIds,
        cooperationPathMemory: playbook.cooperationPathMemory ?? [],
      },
      candidates: candidates.map((candidate) => {
        const currentEvidence = candidate.evidence.filter((item) =>
          isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId));
        const currentEvidenceIds = new Set(currentEvidence.map((item) => item.id));
        const currentFindings = candidate.correction.findings.flatMap((finding) => {
          const evidenceIds = finding.evidenceIds.filter((id) => currentEvidenceIds.has(id));
          return evidenceIds.length > 0 ? [{ ...finding, evidenceIds }] : [];
        });
        const packetPolicy = ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.qualification;
        const evidencePacket = buildModelEvidencePacket(candidate, {
          requiredEvidenceIds: currentFindings.flatMap((finding) => finding.evidenceIds),
          maxUnlinkedItems: packetPolicy.maxUnlinkedItems,
          maxExcerptCharacters: packetPolicy.maxExcerptCharacters,
          relevanceText: currentFindings.map((finding) => finding.statement).join(" "),
        });
        return {
          candidateId: candidate.candidateId,
          companyName: candidate.companyName,
          domain: candidate.domain,
          resolvedRoles: candidate.correction.resolvedRoles,
          resolvedRoleFamilies: candidate.correction.resolvedFamilies,
          primaryBusinessRole: candidate.correction.primaryRole,
          correctionReasons: candidate.correction.reasons,
          correctionConfidence: candidate.correction.confidence,
          findings: currentFindings,
          evidence: evidencePacket.map((item) => ({
            evidenceId: item.evidenceId,
            sourceType: item.sourceType,
            url: item.url,
            title: item.title,
            excerpt: item.excerpt,
          })),
        };
      }),
      scoringRubric: {
        policyKey: ACTIVE_LEAD_SCORING_POLICY.policyKey,
        policyVersion: ACTIVE_LEAD_SCORING_POLICY.version,
        policyChecksum: scoringPolicyChecksum(),
        policy: ACTIVE_LEAD_SCORING_POLICY,
        evidenceSourcePolicy: LEAD_EVIDENCE_SOURCE_POLICY,
        ...(this.includeCooperationPaths ? { cooperationPathPolicy: COOPERATION_PATH_POLICY } : {}),
        outputMode: this.includeCooperationPaths ? "score-and-paths" : "score-only",
        eligibilityGates: ["correctedIdentityUsable", "companyExists", "targetCountryPresence", "networkingRelevant", "independentProspect"],
        dimensions: ACTIVE_LEAD_SCORING_POLICY.weights,
      },
    };
    return {
      task: "lead-qualification" as const,
      modelVersion,
      promptVersion: this.promptVersion,
      input,
      evidenceIds: candidates.flatMap((candidate) => candidate.evidence
        .filter((item) => isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId))
        .map((item) => item.id)),
      outputSchema: z.toJSONSchema(this.includeCooperationPaths
        ? leadAssessmentBatchSchema : leadAssessmentScoreOnlyBatchSchema) as Record<string, unknown>,
      dataClassification: "private-workspace" as const,
    };
  }

  private async invokeBatch(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string,
    usageRecords: WorkflowModelUsage[]) {
    const response = await this.provider.execute<LeadAssessmentRequest, unknown>(
      this.request(candidates, playbook, countryCode, countryName, objective, modelVersion),
      AbortSignal.timeout(modelVersion === this.escalationModel ? 120_000 : 75_000),
    );
    usageRecords.push({ stage: "qualification", requestedModel: response.requestedModelVersion ?? modelVersion,
      actualModel: response.modelVersion, providerId: response.actualProviderId,
      promptTokens: response.usage?.promptTokens ?? 0, completionTokens: response.usage?.completionTokens ?? 0,
      reasoningTokens: response.usage?.reasoningTokens ?? 0, totalTokens: response.usage?.totalTokens ?? 0,
      latencyMs: response.latencyMs, fallbackUsed: Boolean(response.requestedModelVersion
        && (response.requestedModelVersion !== response.modelVersion || response.actualProviderId !== "deepseek")) });
    const parsed = this.includeCooperationPaths
      ? leadAssessmentBatchSchema.parse(response.output)
      : leadAssessmentScoreOnlyBatchSchema.parse(response.output);
    return { response, parsed };
  }

  private async evaluateBatch(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string,
    usageRecords: WorkflowModelUsage[]): Promise<LeadCandidateAssessment[]> {
    try {
      const routine = await this.invokeBatch(candidates, playbook, countryCode, countryName, objective, this.routineModel, usageRecords);
      const values = new Map(routine.parsed.assessments.map((item) => [item.candidateId, item]));
      return await Promise.all(candidates.map(async (candidate) => {
        const value = values.get(candidate.candidateId);
        if (!value) return this.evaluateOneEscalated(candidate, playbook, countryCode, countryName, objective, "Routine batch omitted the candidate.", usageRecords);
        const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
        const normalized = normalizeAssessment(value, candidate, routine.response, false, allowOemOdm,
          this.includeCooperationPaths);
        if (requiresEscalation(candidate, normalized, value)) {
          if (this.routineModel === this.escalationModel) {
            return { ...normalized, warnings: [
              "Escalation was skipped because the configured routine and escalation models are identical.",
              ...normalized.warnings,
            ] };
          }
          return this.evaluateOneEscalated(candidate, playbook, countryCode, countryName, objective, "Routine assessment requested evidence-conflict escalation.", usageRecords);
        }
        return normalized;
      }));
    } catch (error) {
      return Promise.all(candidates.map((candidate) => this.evaluateOneEscalated(
        candidate, playbook, countryCode, countryName, objective,
        `Routine batch failed: ${error instanceof Error ? error.message : String(error)}`, usageRecords,
      )));
    }
  }

  private async evaluateOneEscalated(candidate: CorrectedLeadWorkflowCandidate, playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, reason: string,
    usageRecords: WorkflowModelUsage[]): Promise<LeadCandidateAssessment> {
    try {
      const escalation = await this.provider.execute<LeadAssessmentRequest, unknown>(
        this.request([candidate], playbook, countryCode, countryName, objective, this.escalationModel),
        AbortSignal.timeout(120_000),
      );
      usageRecords.push({ stage: "qualification", requestedModel: escalation.requestedModelVersion ?? this.escalationModel,
        actualModel: escalation.modelVersion, providerId: escalation.actualProviderId,
        promptTokens: escalation.usage?.promptTokens ?? 0, completionTokens: escalation.usage?.completionTokens ?? 0,
        reasoningTokens: escalation.usage?.reasoningTokens ?? 0, totalTokens: escalation.usage?.totalTokens ?? 0,
        latencyMs: escalation.latencyMs, fallbackUsed: Boolean(escalation.requestedModelVersion
          && (escalation.requestedModelVersion !== escalation.modelVersion || escalation.actualProviderId !== "deepseek")) });
      const raw = typeof escalation.output === "object" && escalation.output !== null && "assessments" in escalation.output
        ? (escalation.output as { assessments?: unknown[] }).assessments?.[0]
        : escalation.output;
      const parsed = this.includeCooperationPaths
        ? leadAssessmentModelSchema.parse(raw)
        : leadAssessmentScoreOnlyModelSchema.parse(raw);
      const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
      const normalized = normalizeAssessment(parsed, candidate, escalation, true, allowOemOdm,
        this.includeCooperationPaths);
      return { ...normalized, warnings: [reason, ...normalized.warnings] };
    } catch (error) {
      return failedAssessment(candidate,
        `${reason} Escalation failed: ${error instanceof Error ? error.message : String(error)}`,
        this.promptVersion);
    }
  }

  private async evaluateWithCollector(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string,
    usageRecords: WorkflowModelUsage[]): Promise<LeadCandidateAssessment[]> {
    const batches: CorrectedLeadWorkflowCandidate[][] = [];
    let pending: CorrectedLeadWorkflowCandidate[] = [];
    for (const candidate of candidates) {
      const proposed = [...pending, candidate];
      const inputCharacters = JSON.stringify(this.request(
        proposed, playbook, countryCode, countryName, objective, this.routineModel,
      ).input).length;
      if (pending.length > 0 && (proposed.length > this.batchSize
        || inputCharacters > this.maxBatchInputCharacters)) {
        batches.push(pending);
        pending = [candidate];
      } else {
        pending = proposed;
      }
    }
    if (pending.length > 0) batches.push(pending);
    const results = new Array<LeadCandidateAssessment[]>(batches.length);
    let cursor = 0;
    async function worker(agent: LeadQualificationAgent): Promise<void> {
      while (true) {
        const index = cursor++;
        if (index >= batches.length) return;
        results[index] = await agent.evaluateBatch(batches[index], playbook, countryCode, countryName, objective, usageRecords);
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, batches.length) }, () => worker(this)));
    return results.flat();
  }

  async evaluate(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string): Promise<LeadCandidateAssessment[]> {
    return this.evaluateWithCollector(candidates, playbook, countryCode, countryName, objective, []);
  }

  async evaluateWithUsage(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook,
    countryCode: string, countryName: string, objective: string) {
    const usage: WorkflowModelUsage[] = [];
    const assessments = await this.evaluateWithCollector(candidates, playbook, countryCode, countryName, objective, usage);
    return { assessments, usage };
  }
}
