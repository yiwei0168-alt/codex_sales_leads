import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { DeepSeekProvider } from "@/providers/deepseek";
import { z } from "zod";

import { candidateValueScore, clampDimension, recommendationPriority, salesAccountTier, selectResearchDepth } from "../candidate-value";
import { isCurrentLeadScoringEvidence } from "../evidence-snapshot";
import { COOPERATION_PATH_POLICY, assessCooperationPathEvidence, type CooperationLane } from "../cooperation-path";
import { LEAD_EVIDENCE_SOURCE_POLICY, assessLeadEvidenceQuality } from "../evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../networking-relevance";
import { ACTIVE_LEAD_SCORING_POLICY, scoringPolicyChecksum } from "../scoring-policy";
import { ACTIVE_LEAD_COST_QUALITY_POLICY } from "./cost-quality-policy";
import { buildModelEvidencePacket } from "./evidence-packet";
import { leadAssessmentBatchSchema, leadAssessmentModelSchema, type LeadAssessmentModelOutput } from "./schemas";
import type {
  LeadCandidateAssessment,
  CorrectedLeadWorkflowCandidate,
  LeadMarketPlaybook,
} from "./types";

const PROMPT_VERSION = "lead-value-v4-role-aware-100-point-paths";

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
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, Math.round(value)));
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

export function normalizeAssessment(
  value: LeadAssessmentModelOutput,
  candidate: CorrectedLeadWorkflowCandidate,
  response: StructuredAiResponse<unknown>,
  escalated: boolean,
  allowOemOdm = false,
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
  const cooperationPaths = value.cooperationPaths
    .filter((path) => allowedRoles.has(path.candidateRole))
    .filter((path) => allowOemOdm || path.pathType !== "OEM/ODM")
    .map((path, index) => ({ ...path,
      fitScore: clamp(path.fitScore, 100), confidence: clamp(path.confidence, 100),
      rank: path.rank ?? index + 1,
      evidenceIds: [...new Set(path.evidenceIds.filter((id) => allowedEvidence.has(id)))],
    }))
    .sort((left, right) => left.rank - right.rank || right.fitScore - left.fitScore);
  const selectedPath = cooperationPaths.find((path) => path.pathId === value.selectedPathId) ?? cooperationPaths[0];
  const hasNotSupportedGate = Object.values(gates).some((state) => state === "not-supported");
  const hasUnresolvedGate = Object.values(gates).some((state) => state !== "supported");
  const sizeFinding = candidate.correction.findings.some((finding) => finding.kind === "company-size"
    && finding.status === "supported" && finding.evidenceIds.length > 0);
  const companyScaleClass = sizeFinding ? value.companyScaleClass : "Unknown";
  const researchDepth = selectResearchDepth({ scaleClass: companyScaleClass,
    strongRelevanceSignal: networkingEvidence.demonstrated, userNominated: candidate.userNominated ?? false,
    topNBoundary: false,
    hasConflict: candidate.correction.findings.some((finding) => finding.status === "conflicting") });
  const eligibilityStatus = hasNotSupportedGate ? "ineligible-for-current-task" as const
    : hasUnresolvedGate || cooperationPaths.length === 0
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
    selectedPath, eligibilityStatus, scaleClass: companyScaleClass });
  const roles = candidate.correction.resolvedRoles;
  const primaryRole = candidate.correction.primaryRole;
  const supplyModel = ["Distributor Supply", "Brand Direct", "Co-sell/Co-supply", "TBD"].includes(value.supplyModel)
    ? value.supplyModel as LeadCandidateAssessment["supplyModel"] : "TBD";
  const brandInvolvement = ["Light", "Standard", "Deep"].includes(value.brandInvolvement)
    ? value.brandInvolvement as LeadCandidateAssessment["brandInvolvement"] : "Standard";
  const allowedFindings = new Set(candidate.correction.findings.map((finding) => finding.findingId));
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
      ...(cooperationPaths.length < value.cooperationPaths.length
        ? ["Cooperation paths with unsupported roles, disabled OEM/ODM, or invalid evidence were removed."] : []),
      ...(evidenceIds.length < value.evidenceIds.length ? ["Model returned unsupported evidence IDs; they were removed."] : [])],
  };
}

function requiresEscalation(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
  value: LeadAssessmentModelOutput): boolean {
  const deterministicPathWarning = assessment.warnings.some((warning) => warning.includes("requires review"));
  const materiallyDifferentPaths = new Set(assessment.cooperationPaths.map((path) => path.pathType)).size > 1;
  return value.needsEscalation || value.confidence < 75 || candidate.correction.confidence < 75
    || candidate.correction.identityChanged
    || candidate.correction.primaryRole === "Hybrid" || candidate.correction.primaryRole === "Unresolved"
    || materiallyDifferentPaths
    || candidate.evidenceWarnings.length > 0 || deterministicPathWarning
    || candidate.correction.findings.some((finding) => finding.status === "conflicting")
    || Object.values(assessment.gates).some((state) => state === "conflicting");
}

function failedAssessment(candidate: CorrectedLeadWorkflowCandidate, message: string): LeadCandidateAssessment {
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
    promptVersion: PROMPT_VERSION,
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

  constructor(private readonly provider: AiProvider = new DeepSeekProvider(), options: LeadQualificationAgentOptions = {}) {
    this.routineModel = options.routineModel ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.escalationModel = options.escalationModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.batchSize = Math.max(1, Math.min(5, options.batchSize ?? 5));
    this.maxBatchInputCharacters = Math.max(10_000, options.maxBatchInputCharacters
      ?? ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.qualification.maxBatchInputCharacters);
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 2));
  }

  private request(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string) {
    const input: LeadAssessmentRequest = {
      instructions: [
        "Act as an independent role-aware sales-lead qualification and cooperation-path agent. Ignore provider scores, discovery order and the original search lane.",
        "Assess only supplied current-run evidence. Never invent company facts, roles, scale, product fit, relationships, paths or evidence IDs.",
        "Treat old-run or discovery-only material as a search lead, never as scoring evidence unless it was freshly acquired or revalidated into this run.",
        "Every gate is supported, not-supported, unknown or conflicting. Failed acquisition and missing evidence are unknown, never a negative fact.",
        "Use the candidate's primary business role for scale peer comparison. Use the role performed in each cooperation path for role-specific customer, scenario, positioning and execution criteria.",
        "Product family fit uses the best enabled product track, not average coverage of every Cudy family. Full-portfolio breadth applies only when the task explicitly requests a full-line master distributor.",
        "A broadline distributor is not diluted by unrelated categories. A focused SMB specialist is not penalized for lacking home, ISP or industrial families.",
        "Selling competitor brands is normally positive category evidence. Penalize only evidenced exclusivity, hard vendor lock-in, direct own-brand conflict, refusal or lack of entry space.",
        "Generate every evidence-supported viable cooperation path, rank each path, and select one current recommendation. The same candidate may have direct-distribution, downstream, project or co-sell alternatives.",
        "Do not use an upward channel hierarchy. The recommended path depends on the user stage, market, product track, candidate roles and evidence.",
        "Use supplied private cooperation-path memory as a higher-priority user preference for analogous contexts, never as an objective company fact or score evidence. Request escalation when it conflicts with current evidence.",
        "OEM/ODM is disabled unless the task objective explicitly asks for OEM, ODM, private label or manufacturing cooperation.",
        "For very large or strategically important companies, request deep research when relevant business-unit or regional evidence is incomplete. For a positively identified small weak-signal long-tail company, limited research may end as insufficient-evidence-for-recommendation.",
        "Return exactly one evidence-linked rationale for each of the seven scoring dimensions. Evidence confidence is reported separately and has zero score weight.",
        "Product and use-case fit is 50 points: product family 25, customer/scenario 15, positioning 10. Other dimensions are path/influence 15, same-role scale/coverage 15, execution/enablement 10, opportunity/risk 10.",
        "Use current task fit for eligibility. No company-size gate exists. A small specialist with direct scenario evidence remains eligible.",
        "KA is never a tier-1 distributor label. Account tier and recommendation priority are computed deterministically after your assessment and must not influence dimension scores.",
        "Return one assessment for every candidateId and request escalation for Hybrid/Unresolved roles, evidence conflicts, material alternative routes, confidence below 75 or a likely Top-N boundary.",
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
        cooperationPathPolicy: COOPERATION_PATH_POLICY,
        eligibilityGates: ["correctedIdentityUsable", "companyExists", "targetCountryPresence", "networkingRelevant", "independentProspect"],
        dimensions: ACTIVE_LEAD_SCORING_POLICY.weights,
      },
    };
    return {
      task: "lead-qualification" as const,
      modelVersion,
      promptVersion: PROMPT_VERSION,
      input,
      evidenceIds: candidates.flatMap((candidate) => candidate.evidence
        .filter((item) => isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId))
        .map((item) => item.id)),
      outputSchema: z.toJSONSchema(leadAssessmentBatchSchema) as Record<string, unknown>,
    };
  }

  private async invokeBatch(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string) {
    const response = await this.provider.execute<LeadAssessmentRequest, unknown>(
      this.request(candidates, playbook, countryCode, countryName, objective, modelVersion),
      AbortSignal.timeout(modelVersion === this.escalationModel ? 120_000 : 75_000),
    );
    const parsed = leadAssessmentBatchSchema.parse(response.output);
    return { response, parsed };
  }

  private async evaluateBatch(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string): Promise<LeadCandidateAssessment[]> {
    try {
      const routine = await this.invokeBatch(candidates, playbook, countryCode, countryName, objective, this.routineModel);
      const values = new Map(routine.parsed.assessments.map((item) => [item.candidateId, item]));
      return await Promise.all(candidates.map(async (candidate) => {
        const value = values.get(candidate.candidateId);
        if (!value) return this.evaluateOneEscalated(candidate, playbook, countryCode, countryName, objective, "Routine batch omitted the candidate.");
        const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
        const normalized = normalizeAssessment(value, candidate, routine.response, false, allowOemOdm);
        if (requiresEscalation(candidate, normalized, value)) {
          return this.evaluateOneEscalated(candidate, playbook, countryCode, countryName, objective, "Routine assessment requested evidence-conflict escalation.");
        }
        return normalized;
      }));
    } catch (error) {
      return Promise.all(candidates.map((candidate) => this.evaluateOneEscalated(
        candidate, playbook, countryCode, countryName, objective,
        `Routine batch failed: ${error instanceof Error ? error.message : String(error)}`,
      )));
    }
  }

  private async evaluateOneEscalated(candidate: CorrectedLeadWorkflowCandidate, playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, reason: string): Promise<LeadCandidateAssessment> {
    try {
      const escalation = await this.provider.execute<LeadAssessmentRequest, unknown>(
        this.request([candidate], playbook, countryCode, countryName, objective, this.escalationModel),
        AbortSignal.timeout(120_000),
      );
      const raw = typeof escalation.output === "object" && escalation.output !== null && "assessments" in escalation.output
        ? (escalation.output as { assessments?: unknown[] }).assessments?.[0]
        : escalation.output;
      const parsed = leadAssessmentModelSchema.parse(raw);
      const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
      const normalized = normalizeAssessment(parsed, candidate, escalation, true, allowOemOdm);
      return { ...normalized, warnings: [reason, ...normalized.warnings] };
    } catch (error) {
      return failedAssessment(candidate, `${reason} Escalation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async evaluate(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string): Promise<LeadCandidateAssessment[]> {
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
        results[index] = await agent.evaluateBatch(batches[index], playbook, countryCode, countryName, objective);
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, batches.length) }, () => worker(this)));
    return results.flat();
  }
}
