import { compactLeadSingleton } from "@/providers/compact-lead-request";
import {BudgetDeniedError} from "@/lib/billing/policy";
import {withCompanyCostAttribution} from "@/lib/billing/company-cost-context";
import {leadRequestBatches} from "@/providers/lead-request-batches";
import {LeadRequestTooLargeError,leadRequestByteLimit} from "@/providers/lead-request-bounds";
import {validateBatchItems} from "./batch-output";
import type { AiExecutionRoute,AiProvider,StructuredAiRequest, StructuredAiResponse } from "@/providers/contracts";
import { createLeadAiProvider } from "@/providers/resilient-ai";
import { z } from "zod";
import {isDeepStrictEqual} from "node:util";

import { candidateValueScore, clampDimension, recommendationPriority, salesAccountTier, selectResearchDepth } from "../candidate-value";
import { isCurrentLeadScoringEvidence } from "../evidence-snapshot";
import { COOPERATION_PATH_POLICY, assessCooperationPathEvidence, type CooperationLane } from "../cooperation-path";
import { LEAD_EVIDENCE_SOURCE_POLICY, assessLeadEvidenceQuality } from "../evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../networking-relevance";
import { MODEL_SCORING_POLICY } from '../model-scoring-policy';
import { ACTIVE_LEAD_COST_QUALITY_POLICY } from "./cost-quality-policy";
import { buildModelEvidencePacket } from "./evidence-packet";
import { roleScoringAnchors } from "./role-scoring-anchors";
import {assembleQualificationPhaseSynthesis} from "./qualification-phase-synthesis";
import {compactQualificationPhaseReferences} from "./qualification-phase-reference-compaction";
import type {QualificationPhaseOutput} from "./qualification-phase-output";
import {planQualificationFactPhases} from "./qualification-phase-plan";
import {productQualificationPhaseCheckpoint} from "./qualification-phase-checkpoint";
import {productQualificationFinalCheckpoint} from "./qualification-final-checkpoint";
import { leadAssessmentBatchSchema, leadAssessmentModelSchema, leadAssessmentScoreOnlyBatchSchema,
  leadAssessmentScoreOnlyModelSchema, type LeadAssessmentModelOutput,
  type LeadAssessmentScoreOnlyModelOutput } from "./schemas";
import type {
  LeadCandidateAssessment,
  CorrectedLeadWorkflowCandidate,
  LeadMarketPlaybook,
  WorkflowModelUsage,
} from "./types";

export const LEAD_QUALIFICATION_PROMPT_VERSION = "lead-value-v7-role-anchors-five-paths";
export const LEAD_SCORE_ONLY_PROMPT_VERSION = "lead-value-v10-role-anchors-score-only";
type QualificationModelOutput = LeadAssessmentModelOutput | LeadAssessmentScoreOnlyModelOutput;
function validatedAssessmentSchema(includePaths:boolean):z.ZodType<QualificationModelOutput>{
  return (includePaths?leadAssessmentModelSchema:leadAssessmentScoreOnlyModelSchema)
    .refine(value=>new Set(value.dimensionRationales.map(item=>item.dimension)).size===7,"Each score dimension must have exactly one rationale");
}

interface LeadAssessmentRequest {
  instructions: string[];
  phaseScreening?: {
    version:string;sourceFingerprint:string;
    factColumns:string[];factRows:unknown[][];sourceColumns:string[];sourceRows:unknown[][];
    sourceReferenceEncoding?:string;
    foldedEvidenceIds?:readonly string[];
  };
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
    roleScoringAnchors: ReturnType<typeof roleScoringAnchors>;
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
  phaseCheckpointFactory?: typeof productQualificationPhaseCheckpoint;
  finalCheckpointFactory?: typeof productQualificationFinalCheckpoint;
}

export interface QualificationPhaseScope {userId:string;workspaceId:string;actionId:string}

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

function correctedCountryGate(candidate: CorrectedLeadWorkflowCandidate,
  modelState: LeadAssessmentModelOutput["gates"]["targetCountryPresence"]) {
  const findings = candidate.correction.findings.filter((finding) => finding.kind === "country-presence"
    && finding.evidenceIds.length > 0);
  const supported = findings.some((finding) => finding.status === "supported");
  const contradicted = findings.some((finding) => finding.status === "not-supported");
  const conflicting = findings.some((finding) => finding.status === "conflicting") || supported && contradicted;
  if (conflicting) return "conflicting" as const;
  if (contradicted) return "not-supported" as const;
  return corroboratedGate(modelState, supported);
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

function assessmentEvidenceCaps(candidate: CorrectedLeadWorkflowCandidate,
  companyScaleClass: LeadCandidateAssessment["companyScaleClass"]) {
  const claimEvidence = candidate.evidence.filter((item) =>
    isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId));
  const claimEvidenceText = claimEvidence.flatMap((item) => [item.title, item.excerpt]);
  const pathEvidenceAssessment = (candidate.correction.resolvedFamilies.length > 0
    ? candidate.correction.resolvedFamilies : [candidate.queryFamily])
    .map((family) => assessCooperationPathEvidence({ lane: cooperationLane(family), evidence: claimEvidenceText }))
    .sort((left, right) => right.cap - left.cap)[0];
  return {
    cooperationPathAndBuyingInfluence: pathEvidenceAssessment.cap * 3,
    scaleAndChannelCoverage: companyScaleClass === "Unknown" ? 8 : 15,
    pathReason: pathEvidenceAssessment.reason,
  };
}

export function enforceAssessmentEvidenceCaps(candidate: CorrectedLeadWorkflowCandidate,
  assessment: LeadCandidateAssessment): LeadCandidateAssessment {
  const caps = assessmentEvidenceCaps(candidate, assessment.companyScaleClass);
  const dimensions = { ...assessment.dimensions,
    cooperationPathAndBuyingInfluence: Math.min(assessment.dimensions.cooperationPathAndBuyingInfluence,
      caps.cooperationPathAndBuyingInfluence),
    scaleAndChannelCoverage: Math.min(assessment.dimensions.scaleAndChannelCoverage,
      caps.scaleAndChannelCoverage) };
  if (dimensions.cooperationPathAndBuyingInfluence === assessment.dimensions.cooperationPathAndBuyingInfluence
    && dimensions.scaleAndChannelCoverage === assessment.dimensions.scaleAndChannelCoverage) return assessment;
  const totalScore = candidateValueScore(dimensions);
  const selectedPath = assessment.cooperationPaths.find((path) => path.pathId === assessment.selectedPathId)
    ?? assessment.cooperationPaths[0];
  return { ...assessment, dimensions, totalScore,
    scoreRange: { lower: Math.max(0, totalScore - (assessment.totalScore - assessment.scoreRange.lower)),
      upper: Math.min(100, totalScore + (assessment.scoreRange.upper - assessment.totalScore)) },
    recommendationPriority: recommendationPriority(totalScore, assessment.eligibilityStatus),
    accountTier: salesAccountTier({ score: totalScore,
      scaleAndChannelCoverage: dimensions.scaleAndChannelCoverage,
      cooperationPathAndBuyingInfluence: dimensions.cooperationPathAndBuyingInfluence,
      selectedPath, primaryRole: candidate.correction.primaryRole,
      eligibilityStatus: assessment.eligibilityStatus, scaleClass: assessment.companyScaleClass }),
    dimensionRationales: assessment.dimensionRationales.map((rationale) => ({ ...rationale,
      score: dimensions[rationale.dimension] })),
    warnings: [...assessment.warnings,
      ...(dimensions.cooperationPathAndBuyingInfluence < assessment.dimensions.cooperationPathAndBuyingInfluence
        ? [`Cooperation-path score was capped at ${caps.cooperationPathAndBuyingInfluence}/15 by deterministic evidence: ${caps.pathReason}`] : []),
      ...(dimensions.scaleAndChannelCoverage < assessment.dimensions.scaleAndChannelCoverage
        ? ["Scale/channel score was capped at the neutral 8/15 because no positive evidence established a scale class; unknown was not treated as zero."] : [])] };
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
    targetCountryPresence: correctedCountryGate(candidate, value.gates.targetCountryPresence),
  };
  const sizeFinding = candidate.correction.findings.some((finding) => finding.kind === "company-size"
    && finding.status === "supported" && finding.evidenceIds.length > 0);
  const companyScaleClass = sizeFinding ? value.companyScaleClass : "Unknown";
  const caps = assessmentEvidenceCaps(candidate, companyScaleClass);
  const dimensions = {
    productFamilyMatch: clampDimension("productFamilyMatch", value.dimensions.productFamilyMatch),
    customerAndScenarioOverlap: clampDimension("customerAndScenarioOverlap", value.dimensions.customerAndScenarioOverlap),
    positioningCompatibility: clampDimension("positioningCompatibility", value.dimensions.positioningCompatibility),
    cooperationPathAndBuyingInfluence: Math.min(caps.cooperationPathAndBuyingInfluence,
      clampDimension("cooperationPathAndBuyingInfluence", value.dimensions.cooperationPathAndBuyingInfluence)),
    scaleAndChannelCoverage: Math.min(caps.scaleAndChannelCoverage,
      clampDimension("scaleAndChannelCoverage", value.dimensions.scaleAndChannelCoverage)),
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
      ...(value.gates.targetCountryPresence === "supported" && gates.targetCountryPresence !== "supported"
        ? ["Target-country presence claimed by scoring was not corroborated by the correction-stage country finding."] : []),
      ...(!evidenceQuality.sufficient ? [`Evidence remains sparse: ${evidenceQuality.reason}`] : []),
      ...(value.dimensions.cooperationPathAndBuyingInfluence > caps.cooperationPathAndBuyingInfluence
        ? [`Cooperation-path score was capped at ${caps.cooperationPathAndBuyingInfluence}/15 by deterministic evidence: ${pathEvidenceAssessment.reason}`] : []),
      ...(value.dimensions.scaleAndChannelCoverage > caps.scaleAndChannelCoverage
        ? ["Scale/channel score was capped at the neutral 8/15 because no positive evidence established a scale class; unknown was not treated as zero."] : []),
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

function deferredAfterCacheFailure(candidate: CorrectedLeadWorkflowCandidate, promptVersion: string): LeadCandidateAssessment {
  return { ...failedAssessment(candidate,
    "Scoring was deferred after a completed batch could not be saved; no request was sent for this candidate.", promptVersion),
  summary: "Scoring is pending because completed-batch persistence was unavailable.",
  reasons: ["The scoring request for this candidate was not started."],
  risks: ["Resume only after completed outputs and paid-request status have been checked."] };
}

export class LeadQualificationAgent {
  private readonly routineModel: string;
  private readonly escalationModel: string;
  private readonly batchSize: number;
  private readonly maxBatchInputCharacters: number;
  private readonly exactAssessmentContracts=new WeakMap<LeadCandidateAssessment,string>();
  private readonly concurrency: number;
  private readonly includeCooperationPaths: boolean;
  private readonly phaseCheckpointFactory:typeof productQualificationPhaseCheckpoint;
  private readonly finalCheckpointFactory:typeof productQualificationFinalCheckpoint;

  constructor(private readonly provider: AiProvider = createLeadAiProvider(), options: LeadQualificationAgentOptions = {}) {
    this.routineModel = options.routineModel ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.escalationModel = options.escalationModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.batchSize = Math.max(1, Math.min(5, options.batchSize ?? 5));
    this.maxBatchInputCharacters = Math.max(10_000, options.maxBatchInputCharacters
      ?? ACTIVE_LEAD_COST_QUALITY_POLICY.evidencePackets.qualification.maxBatchInputCharacters);
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 2));
    this.includeCooperationPaths = options.includeCooperationPaths ?? true;
    this.phaseCheckpointFactory=options.phaseCheckpointFactory??productQualificationPhaseCheckpoint;
    this.finalCheckpointFactory=options.finalCheckpointFactory??productQualificationFinalCheckpoint;
  }

  private get promptVersion(): string {
    return this.includeCooperationPaths ? LEAD_QUALIFICATION_PROMPT_VERSION : LEAD_SCORE_ONLY_PROMPT_VERSION;
  }

  private requestableCandidates(candidates:CorrectedLeadWorkflowCandidate[],playbook:LeadMarketPlaybook,
    countryCode:string,countryName:string,objective:string){
    const ready:CorrectedLeadWorkflowCandidate[]=[];
    const oversized=new Map<string,LeadRequestTooLargeError>();
    for(const candidate of candidates){
      try{
        leadRequestBatches([candidate],items=>this.request(items,playbook,countryCode,countryName,objective,this.routineModel),
          this.batchSize,this.maxBatchInputCharacters,this.provider.requestBytes?.bind(this.provider));
        ready.push(candidate);
      }catch(error){
        if(!(error instanceof LeadRequestTooLargeError))throw error;
        oversized.set(candidate.candidateId,error);
      }
    }
    return {ready,oversized};
  }

  cacheContracts(candidates:CorrectedLeadWorkflowCandidate[],playbook:LeadMarketPlaybook,countryCode:string,countryName:string,objective:string):Map<string,string>{
    const result=new Map<string,string>();
    if(!this.provider.cacheIdentity)return result;
    const {ready}=this.requestableCandidates(candidates.filter(candidate=>roleScoringAnchors(candidate.correction)),
      playbook,countryCode,countryName,objective);
    const batches=leadRequestBatches(ready,items=>this.request(items,playbook,countryCode,countryName,objective,this.routineModel),this.batchSize,this.maxBatchInputCharacters,this.provider.requestBytes?.bind(this.provider));
    for(const batch of batches){
      const contract=this.provider.cacheIdentity(this.request(batch,playbook,countryCode,countryName,objective,this.routineModel));
      if(contract)for(const candidate of batch)result.set(candidate.candidateId,contract);
    }
    return result;
  }

  completedCacheContracts(assessments:LeadCandidateAssessment[]):Map<string,string>{
    return new Map(assessments.flatMap(assessment=>{
      const contract=this.exactAssessmentContracts.get(assessment);
      return contract?[[assessment.candidateId,contract] as const]:[];
    }));
  }

  /** Pure preflight: no phase or final provider request is sent. */
  planPhasedFinalRequest(candidate:CorrectedLeadWorkflowCandidate,playbook:LeadMarketPlaybook,
    countryCode:string,countryName:string,objective:string,
    outputs:QualificationPhaseOutput[],finalModel=this.routineModel){
    if(!this.provider.requestBytes)throw new Error("Phase scoring requires an exact provider byte contract");
    const plan=planQualificationFactPhases({candidate,playbook,countryCode,countryName,objective,
      modelVersion:this.routineModel,requestBytes:request=>this.provider.requestBytes!(request)});
    const synthesis=assembleQualificationPhaseSynthesis({candidate,playbook,countryCode,countryName,objective,
      modelVersion:this.routineModel,plan,outputs});
    const request=this.request([candidate],playbook,countryCode,countryName,objective,
      finalModel,synthesis);
    const bytes=this.provider.requestBytes(request),limit=leadRequestByteLimit(request);
    if(limit!==null&&bytes>limit)throw new LeadRequestTooLargeError(bytes,limit);
    return {plan,synthesis,request};
  }

  private executionRoutes(request:StructuredAiRequest<unknown>):AiExecutionRoute[]{
    const primaryId=this.provider.id.replace(/^resilient:/,"");
    const routes=this.provider.executionRoutes?.(request)??[{
      providerId:primaryId,request,cacheIdentity:this.provider.cacheIdentity?.(request)??"",
      paidRequestFingerprint:this.provider.paidRequestFingerprint?.(request)??""}];
    if(!routes.length||routes[0].providerId!==primaryId
      ||routes[0].request.modelVersion!==request.modelVersion
      ||routes.some(route=>!/^[a-f0-9]{64}$/.test(route.cacheIdentity)
        ||!/^[a-f0-9]{64}$/.test(route.paidRequestFingerprint)
        ||!route.providerId.trim()
        ||!isDeepStrictEqual({...route.request,modelVersion:request.modelVersion},request))
      ||new Set(routes.map(route=>`${route.providerId}:${route.request.modelVersion}`)).size
        !==routes.length)
      throw new Error("Qualification route identity unavailable; no paid call is safe");
    return routes;
  }

  private routeForResponse(routes:AiExecutionRoute[],response:StructuredAiResponse<unknown>){
    const route=routes.find(item=>item.providerId===response.actualProviderId
      &&item.request.modelVersion===response.modelVersion);
    if(!route)throw new Error("Qualification actual route differs from every exact approved provider/model identity");
    return route;
  }

  private phasePlan(candidate:CorrectedLeadWorkflowCandidate,playbook:LeadMarketPlaybook,
    countryCode:string,countryName:string,objective:string){
    if(!this.provider.requestBytes)throw new Error("Phase scoring requires an exact provider byte contract");
    return planQualificationFactPhases({candidate,playbook,countryCode,countryName,objective,
      modelVersion:this.routineModel,requestBytes:request=>this.provider.requestBytes!(request)});
  }

  async phasedCacheContracts(candidates:CorrectedLeadWorkflowCandidate[],playbook:LeadMarketPlaybook,
    countryCode:string,countryName:string,objective:string,scope:QualificationPhaseScope):Promise<Map<string,string>>{
    const contracts=new Map<string,string>();
    if(!this.provider.cacheIdentity||!this.provider.paidRequestFingerprint||!this.provider.requestBytes)return contracts;
    const oversized=this.requestableCandidates(candidates,playbook,countryCode,countryName,objective).oversized;
    for(const candidate of candidates){
      if(!oversized.has(candidate.candidateId))continue;
      let plan:ReturnType<typeof planQualificationFactPhases>;
      try{plan=this.phasePlan(candidate,playbook,countryCode,countryName,objective);}
      catch(error){if(error instanceof LeadRequestTooLargeError)continue;throw error;}
      const outputs:QualificationPhaseOutput[]=[];
      for(const request of plan.phases){
        let hit:StructuredAiResponse<QualificationPhaseOutput>|null=null;
        for(const route of this.executionRoutes(request)){
          const checkpoint=this.phaseCheckpointFactory({...scope,countryCode,
            expectedProviderId:route.providerId,requestedModelVersion:request.modelVersion});
          hit=await checkpoint.load(route.request,route.cacheIdentity,route.paidRequestFingerprint);
          if(hit)break;
        }
        if(!hit)break;
        outputs.push(hit.output);
      }
      if(outputs.length!==plan.phases.length)continue;
      try{
        const final=this.planPhasedFinalRequest(candidate,playbook,countryCode,countryName,objective,outputs);
        let contract=this.provider.cacheIdentity(final.request);
        for(const route of this.executionRoutes(final.request)){
          const finalCheckpoint=this.finalCheckpointFactory({...scope,countryCode,
            expectedProviderId:route.providerId,requestedModelVersion:final.request.modelVersion});
          if(await finalCheckpoint.load(route.request,route.cacheIdentity,route.paidRequestFingerprint)){
            contract=route.cacheIdentity;break;
          }
        }
        if(this.routineModel!==this.escalationModel){
          try{
            const pro=this.planPhasedFinalRequest(candidate,playbook,countryCode,countryName,
              objective,outputs,this.escalationModel);
            for(const route of this.executionRoutes(pro.request)){
              const finalCheckpoint=this.finalCheckpointFactory({...scope,countryCode,
                expectedProviderId:route.providerId,requestedModelVersion:pro.request.modelVersion});
              if(await finalCheckpoint.load(route.request,route.cacheIdentity,
                route.paidRequestFingerprint)){
                contract=route.cacheIdentity;break;
              }
            }
          }catch(error){if(!(error instanceof LeadRequestTooLargeError))throw error;}
        }
        if(/^[a-f0-9]{64}$/.test(contract))contracts.set(candidate.candidateId,contract);
      }catch(error){if(!(error instanceof LeadRequestTooLargeError))throw error;}
    }
    return contracts;
  }

  private request(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string,
    synthesis?:ReturnType<typeof assembleQualificationPhaseSynthesis>) {
    if(synthesis&&(candidates.length!==1||candidates[0].candidateId!==synthesis.candidateId))
      throw new Error("Phase synthesis must match one scoring candidate");
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
        ...(synthesis?["The phaseScreening factRows and sourceRows use the matching Columns arrays. Each fact retains its corrected status, original citation IDs and screened summary; critical or non-supported corrected statements are also retained verbatim. Every current source retains its ID and type; source URLs were available in the bounded phases and remain linked by ID outside this final prompt. Phase summaries are bounded interpretations, not raw quotations or independent corroboration. Preserve uncertain, conflicting and negative findings; missing raw excerpts after phase screening are not negative evidence."]:[]),
        ...(synthesis?.foldedEvidenceIds.length?["foldedEvidenceIds lists sources whose long, supported noncritical excerpts had their middle omitted in a fact phase. Do not treat omitted text or phase summaries as independent corroboration or upgrade an eligibility gate from them."]:[]),
        "Treat old-run or discovery-only material as a search lead, never as scoring evidence unless it was freshly acquired or revalidated into this run.",
        "Every gate is supported, not-supported, unknown or conflicting. Failed acquisition and missing evidence are unknown, never a negative fact.",
        "The targetCountryPresence gate must follow the supplied correction-stage country-presence finding for this exact candidate and target market; never infer it from an unrelated page or from operations in a different country.",
        "Use the candidate's primary business role for scale peer comparison and for role-specific customer, scenario, positioning and execution criteria.",
        "Use roleScoringAnchors to select the policy scorecard and observable subtype evidence. Families are taxonomy groups, not business subtypes. These examples neither award points automatically nor add eligibility requirements. Link each claimed capability to supplied current evidence; missing examples remain unknown. Never borrow another subtype's purchasing authority or demand another role's operating model.",
        "Product family fit uses the best enabled product track, not average coverage of every Cudy family. Full-portfolio breadth applies only when the task explicitly requests a full-line master distributor.",
        "A broadline distributor is not diluted by unrelated categories. A focused SMB specialist is not penalized for lacking home, ISP or industrial families.",
        "Selling competitor brands is normally positive category evidence. Penalize only evidenced exclusivity, hard vendor lock-in, direct own-brand conflict, refusal or lack of entry space.",
        ...pathInstructions,
        "For very large or strategically important companies, request deep research when relevant business-unit or regional evidence is incomplete. For a positively identified small weak-signal long-tail company, limited research may end as insufficient-evidence-for-recommendation.",
        "Return exactly one evidence-linked rationale for each of the seven scoring dimensions. Evidence confidence is reported separately and has zero score weight.",
        "Product and use-case fit is 50 points: product family 25, customer/scenario 15, positioning 10. Other dimensions are path/influence 15, same-role scale/coverage 15, execution/enablement 10, opportunity/risk 10.",
        "Do not award more than the neutral 8/15 for scale/channel coverage unless a supported atomic company-size finding establishes a scale class. Unknown scale is neutral, not zero or maximum. Cooperation-path/influence is deterministically capped by demonstrated procurement, selection, resale or influence levers.",
        "Use current task fit for eligibility. No company-size gate exists. A small specialist with direct scenario evidence remains eligible.",
        "KA is never a tier-1 distributor label. Account tier and recommendation priority are computed deterministically after your assessment and must not influence dimension scores.",
        "Return one assessment for every candidateId. Request escalation only when a higher-capability model can resolve the issue and is expected to change total score by at least 8 points or change a critical identity, eligibility, primary-role, existence, country-presence or networking-relevance state. Top-N position and confidence alone never justify escalation.",
      ],
      ...(synthesis?{phaseScreening:{version:synthesis.version,sourceFingerprint:synthesis.sourceFingerprint,
        ...(synthesis.foldedEvidenceIds.length?{foldedEvidenceIds:synthesis.foldedEvidenceIds}:{}),
        factColumns:["findingId","kind","status","retainedCorrectedStatement","evidenceIds",
          "phaseMateriality","phaseSummary","phaseCitedEvidenceIds"],
        factRows:synthesis.facts.map(item=>[item.findingId,item.kind,item.status,
          item.status!=="supported"||["identity","country-presence","role"].includes(item.kind)
            ?item.statement:null,item.evidenceIds,item.screeningMateriality,item.screeningSummary,
          item.screeningCitedEvidenceIds]),
        sourceColumns:["evidenceId","sourceType","unlinkedPhaseMateriality",
          "unlinkedPhaseSummary"],
        sourceRows:synthesis.sources.map(item=>item.screeningSummary
          ?[item.evidenceId,item.sourceType,item.screeningMateriality,item.screeningSummary]
          :[item.evidenceId,item.sourceType])}}:{}),
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
        const evidencePacket = synthesis?[]:buildModelEvidencePacket(candidate, {
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
          roleScoringAnchors: roleScoringAnchors(candidate.correction),
          correctionReasons: candidate.correction.reasons,
          correctionConfidence: candidate.correction.confidence,
          findings: synthesis?[]:currentFindings,
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
        policy: MODEL_SCORING_POLICY,
        evidenceSourcePolicy: LEAD_EVIDENCE_SOURCE_POLICY,
        ...(this.includeCooperationPaths ? { cooperationPathPolicy: COOPERATION_PATH_POLICY } : {}),
        outputMode: this.includeCooperationPaths ? "score-and-paths" : "score-only",
        eligibilityGates: ["correctedIdentityUsable", "companyExists", "targetCountryPresence", "networkingRelevant", "independentProspect"],
      },
    };
    const request=compactLeadSingleton({
      task: "lead-qualification" as const,
      modelVersion,
      promptVersion: this.promptVersion,
      input,
      evidenceIds: candidates.flatMap((candidate) => candidate.evidence
        .filter((item) => isCurrentLeadScoringEvidence(item, candidate.evidenceSnapshotRunId))
        .map((item) => item.id)),
      outputSchema: z.toJSONSchema(this.includeCooperationPaths
        ? leadAssessmentBatchSchema : leadAssessmentScoreOnlyBatchSchema) as Record<string, unknown>,
      dataClassification: (playbook.cooperationPathMemory?.length
        ? "private-workspace" : "public") as "private-workspace" | "public",
    }, this.provider.requestBytes?.bind(this.provider));
    return this.provider.requestBytes
      ?compactQualificationPhaseReferences(request,this.provider.requestBytes.bind(this.provider))
      :request;
  }

  private async invokeBatch(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string,
    usageRecords: WorkflowModelUsage[],preparedRequest?:ReturnType<LeadQualificationAgent["request"]>,
    responseOverride?:StructuredAiResponse<unknown>,recordUsage=true) {
    const request=preparedRequest??this.request(candidates,playbook,countryCode,countryName,objective,modelVersion);
    const response = responseOverride??await withCompanyCostAttribution(candidates,countryCode,()=>this.provider.execute<LeadAssessmentRequest, unknown>(
      request,
      AbortSignal.timeout(modelVersion === this.escalationModel ? 120_000 : 75_000),
    ));
    if(recordUsage)usageRecords.push({ stage: "qualification", requestPreparation:request.preparation, requestedModel: response.requestedModelVersion ?? modelVersion,
      actualModel: response.modelVersion, providerId: response.actualProviderId,
      promptTokens: response.usage?.promptTokens ?? 0, completionTokens: response.usage?.completionTokens ?? 0,
      reasoningTokens: response.usage?.reasoningTokens ?? 0, totalTokens: response.usage?.totalTokens ?? 0,
      latencyMs: response.latencyMs, fallbackUsed: Boolean(response.requestedModelVersion
        && (response.requestedModelVersion !== response.modelVersion || response.actualProviderId !== "deepseek")),
      attempts: response.attempts, retries: response.retries,
      accountCashCostUsd: response.usage?.accountCashCostUsd });
    const validated=validateBatchItems<QualificationModelOutput>(response.output,"assessments",
      validatedAssessmentSchema(this.includeCooperationPaths),
      candidates.map(candidate=>candidate.candidateId));
    const parsed={assessments:validated.items,complete:validated.complete};
    if(recordUsage)usageRecords[usageRecords.length-1].batchValidation={inputItems:candidates.length,validOutputItems:validated.items.length,rejectedOutputItems:validated.rejectedItems,missingOutputItems:validated.missingItems,complete:validated.complete};
    return { response, parsed };
  }

  private async invokeCheckpointedPhasedFinal(candidate:CorrectedLeadWorkflowCandidate,
    playbook:LeadMarketPlaybook,countryCode:string,countryName:string,objective:string,
    request:ReturnType<LeadQualificationAgent["request"]>,scope:QualificationPhaseScope,
    usageRecords:WorkflowModelUsage[]){
    const routes=this.executionRoutes(request);
    let response:StructuredAiResponse<unknown>|null=null;
    let completedRoute:AiExecutionRoute|null=null;
    for(const route of routes){
      const checkpoint=this.finalCheckpointFactory({...scope,countryCode,
        expectedProviderId:route.providerId,requestedModelVersion:request.modelVersion});
      response=await checkpoint.load(route.request,route.cacheIdentity,route.paidRequestFingerprint);
      if(response){completedRoute=route;break;}
    }
    const reused=Boolean(response);
    if(!response){
      const guardCheckpoint=this.finalCheckpointFactory({...scope,countryCode,
        expectedProviderId:routes[0].providerId,requestedModelVersion:request.modelVersion});
      await guardCheckpoint.assertNoOtherCompleted?.(request,routes.map(route=>({
        contract:route.cacheIdentity,paidFingerprint:route.paidRequestFingerprint})));
      const fresh=await withCompanyCostAttribution([candidate],countryCode,()=>this.provider.execute(
        request,AbortSignal.timeout(120_000)));
      completedRoute=this.routeForResponse(routes,fresh);
      const checkpoint=this.finalCheckpointFactory({...scope,countryCode,
        expectedProviderId:completedRoute.providerId,requestedModelVersion:request.modelVersion});
      await checkpoint.save(completedRoute.request,completedRoute.cacheIdentity,
        completedRoute.paidRequestFingerprint,fresh);
      response=await checkpoint.load(completedRoute.request,completedRoute.cacheIdentity,
        completedRoute.paidRequestFingerprint);
      if(!response)throw new Error("Completed qualification final checkpoint could not be read");
    }
    return {...await this.invokeBatch([candidate],playbook,countryCode,countryName,objective,
      request.modelVersion,usageRecords,request,response,!reused),contract:completedRoute!.cacheIdentity};
  }

  private async evaluatePhased(candidate:CorrectedLeadWorkflowCandidate,playbook:LeadMarketPlaybook,
    countryCode:string,countryName:string,objective:string,scope:QualificationPhaseScope,
    usageRecords:WorkflowModelUsage[]):Promise<LeadCandidateAssessment>{
    if(!this.provider.cacheIdentity||!this.provider.paidRequestFingerprint||!this.provider.requestBytes)
      return failedAssessment(candidate,"Phased scoring has no exact primary request/paid replay contract; no request was sent.",this.promptVersion);
    let plan:ReturnType<typeof planQualificationFactPhases>;
    try{plan=this.phasePlan(candidate,playbook,countryCode,countryName,objective);}
    catch(error){if(error instanceof LeadRequestTooLargeError)return failedAssessment(candidate,
      `A single fact phase exceeds the approved byte limit (${error.message}); no request was sent.`,this.promptVersion);
      throw error;}
    if(!plan.phases.length)return failedAssessment(candidate,"No bounded fact phase can be planned; no request was sent.",this.promptVersion);
    const outputs:QualificationPhaseOutput[]=[];
    for(const request of plan.phases){
      const routes=this.executionRoutes(request);
      let cached:StructuredAiResponse<QualificationPhaseOutput>|null=null;
      for(const route of routes){
        const checkpoint=this.phaseCheckpointFactory({...scope,countryCode,
          expectedProviderId:route.providerId,requestedModelVersion:request.modelVersion});
        cached=await checkpoint.load(route.request,route.cacheIdentity,route.paidRequestFingerprint);
        if(cached)break;
      }
      if(cached){outputs.push(cached.output);continue;}
      const checkpointBeforeCall=this.phaseCheckpointFactory({...scope,countryCode,
        expectedProviderId:routes[0].providerId,requestedModelVersion:request.modelVersion});
      await checkpointBeforeCall.assertNoOtherCompleted?.(request,routes.map(route=>({
        contract:route.cacheIdentity,paidFingerprint:route.paidRequestFingerprint})));
      const response=await withCompanyCostAttribution([candidate],countryCode,()=>this.provider.execute(
        request,AbortSignal.timeout(120_000)));
      usageRecords.push({stage:"qualification",requestedModel:response.requestedModelVersion??request.modelVersion,
        actualModel:response.modelVersion,providerId:response.actualProviderId,
        promptTokens:response.usage?.promptTokens??0,completionTokens:response.usage?.completionTokens??0,
        reasoningTokens:response.usage?.reasoningTokens??0,totalTokens:response.usage?.totalTokens??0,
        latencyMs:response.latencyMs,fallbackUsed:Boolean(response.requestedModelVersion
          &&(response.requestedModelVersion!==response.modelVersion||response.actualProviderId!=="deepseek")),
        attempts:response.attempts,retries:response.retries,accountCashCostUsd:response.usage?.accountCashCostUsd,
        batchValidation:{inputItems:(request.input as {candidate:{findings:unknown[]};unlinkedEvidenceIds:string[]})
          .candidate.findings.length+(request.input as {unlinkedEvidenceIds:string[]}).unlinkedEvidenceIds.length,
          validOutputItems:0,rejectedOutputItems:0,missingOutputItems:0,complete:false}});
      // A completed row is written before another phase or final score can incur cost.
      const completedRoute=this.routeForResponse(routes,response);
      const checkpoint=this.phaseCheckpointFactory({...scope,countryCode,
        expectedProviderId:completedRoute.providerId,requestedModelVersion:request.modelVersion});
      await checkpoint.save(completedRoute.request,completedRoute.cacheIdentity,
        completedRoute.paidRequestFingerprint,response);
      const completed=await checkpoint.load(completedRoute.request,completedRoute.cacheIdentity,
        completedRoute.paidRequestFingerprint);
      if(!completed)throw new Error("Completed qualification phase checkpoint could not be read");
      outputs.push(completed.output);
      usageRecords[usageRecords.length-1].batchValidation={...usageRecords[usageRecords.length-1].batchValidation!,
        validOutputItems:completed.output.facts.length+completed.output.sources.length,complete:true};
    }
    let final:ReturnType<LeadQualificationAgent["planPhasedFinalRequest"]>;
    try{final=this.planPhasedFinalRequest(candidate,playbook,countryCode,countryName,objective,outputs);}
    catch(error){if(error instanceof LeadRequestTooLargeError)return failedAssessment(candidate,
      `Phase summaries exceed the final approved score request limit (${error.message}); original evidence remains pending.`,this.promptVersion);
      throw error;}
    const routine=await this.invokeCheckpointedPhasedFinal(candidate,playbook,countryCode,countryName,
      objective,final.request,scope,usageRecords);
    const value=routine.parsed.assessments.find(item=>item.candidateId===candidate.candidateId);
    if(!value||!routine.parsed.complete)return failedAssessment(candidate,
      "Phased final score omitted or invalidated the candidate; paid output is retained for investigation, not replayed.",this.promptVersion);
    const allowOemOdm=/\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
    const normalized=normalizeAssessment(value,candidate,routine.response,false,allowOemOdm,this.includeCooperationPaths);
    if(requiresEscalation(candidate,normalized,value)&&this.routineModel!==this.escalationModel){
      let pro:ReturnType<LeadQualificationAgent["planPhasedFinalRequest"]>;
      try{pro=this.planPhasedFinalRequest(candidate,playbook,countryCode,countryName,
        objective,outputs,this.escalationModel);}
      catch(error){if(error instanceof LeadRequestTooLargeError)return failedAssessment(candidate,
        `The Pro score request exceeds its approved byte limit (${error.message}); the routine response remains saved.`,
        this.promptVersion);throw error;}
      const escalated=await this.invokeCheckpointedPhasedFinal(candidate,playbook,countryCode,countryName,
        objective,pro.request,scope,usageRecords);
      const proValue=escalated.parsed.assessments.find(item=>item.candidateId===candidate.candidateId);
      if(!proValue||!escalated.parsed.complete)return failedAssessment(candidate,
        "Phased Pro score omitted or invalidated the candidate; paid output remains saved, not replayed.",
        this.promptVersion);
      const decided=normalizeAssessment(proValue,candidate,escalated.response,true,allowOemOdm,
        this.includeCooperationPaths);
      const finalDecision={...decided,warnings:["Material semantic escalation from the saved routine score.",
        ...decided.warnings]};
      if(finalDecision.scoringStatus==="completed")this.exactAssessmentContracts.set(finalDecision,
        escalated.contract);
      return finalDecision;
    }
    if(normalized.scoringStatus==="completed")this.exactAssessmentContracts.set(normalized,
      routine.contract);
    return normalized;
  }

  private async evaluateBatch(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string,
    usageRecords: WorkflowModelUsage[],publish?:(candidates:CorrectedLeadWorkflowCandidate[],assessments:LeadCandidateAssessment[])=>Promise<boolean>,
    shouldDefer?:()=>boolean): Promise<LeadCandidateAssessment[]> {
    try {
      const routine = await this.invokeBatch(candidates, playbook, countryCode, countryName, objective, this.routineModel, usageRecords);
      // This is a per-candidate checkpoint, not a claim that the entire batch completed.
      // Each complete candidate retains the ORIGINAL whole-batch request dependency.
      const exactContract=routine.response.modelVersion===this.routineModel
        &&(!routine.response.actualProviderId||routine.response.actualProviderId===this.provider.id.replace(/^resilient:/,""))
        ?this.provider.cacheIdentity?.(this.request(candidates,playbook,countryCode,countryName,objective,this.routineModel)):undefined;
      const values = new Map(routine.parsed.assessments.map((item) => [item.candidateId, item]));
      const stable=new Map<string,LeadCandidateAssessment>();
      for(const candidate of candidates){
        const value = values.get(candidate.candidateId);
        if(!value)continue;
        const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
        const normalized = normalizeAssessment(value, candidate, routine.response, false, allowOemOdm,
          this.includeCooperationPaths);
        if (requiresEscalation(candidate, normalized, value)) {
          if (this.routineModel === this.escalationModel) {
            stable.set(candidate.candidateId,{ ...normalized, warnings: [
              "Escalation was skipped because the configured routine and escalation models are identical.",
              ...normalized.warnings,
            ] });continue;
          }
          continue;
        }
        if(exactContract&&normalized.scoringStatus==="completed")this.exactAssessmentContracts.set(normalized,exactContract);
        stable.set(candidate.candidateId,normalized);
      }
      // Save independently complete peers BEFORE any repair can pause on budget/unknown outcome.
      if(publish&&stable.size>0&&stable.size<candidates.length)await publish(candidates.filter(candidate=>stable.has(candidate.candidateId)),[...stable.values()]);
      if(shouldDefer?.())return candidates.map(candidate=>stable.get(candidate.candidateId)
        ??deferredAfterCacheFailure(candidate,this.promptVersion));
      return await Promise.all(candidates.map(async candidate=>{
        const completed=stable.get(candidate.candidateId);if(completed)return completed;
        if(!values.has(candidate.candidateId))return this.evaluateOneRoutineRepair(candidate,playbook,countryCode,countryName,objective,"Routine batch omitted or invalidated the candidate.",usageRecords);
        return this.evaluateOneEscalated(candidate,playbook,countryCode,countryName,objective,"Routine assessment requested evidence-conflict escalation.",usageRecords);
      }));
    } catch (error) {
      if(error instanceof BudgetDeniedError)throw error;
      const reason = `Routine batch failed: ${error instanceof Error ? error.message : String(error)}`;
      if (error instanceof z.ZodError) {
        return Promise.all(candidates.map((candidate) => this.evaluateOneRoutineRepair(
          candidate, playbook, countryCode, countryName, objective, reason, usageRecords)));
      }
      return candidates.map((candidate) => failedAssessment(candidate,
        `${reason} Infrastructure/provider failure does not qualify for Pro escalation.`, this.promptVersion));
    }
  }

  private async evaluateOneRoutineRepair(candidate: CorrectedLeadWorkflowCandidate,
    playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string,
    reason: string, usageRecords: WorkflowModelUsage[]): Promise<LeadCandidateAssessment> {
    try {
      const routine = await this.invokeBatch([candidate], playbook, countryCode, countryName,
        objective, this.routineModel, usageRecords);
      const value = routine.parsed.assessments.find((item) => item.candidateId === candidate.candidateId);
      if (!value||!routine.parsed.complete) {
        return failedAssessment(candidate,
          `${reason} Same-tier single-candidate schema repair omitted the candidate; Pro escalation was not used.`,
          this.promptVersion);
      }
      const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
      const normalized = normalizeAssessment(value, candidate, routine.response, false, allowOemOdm,
        this.includeCooperationPaths);
      if (requiresEscalation(candidate, normalized, value) && this.routineModel !== this.escalationModel) {
        return this.evaluateOneEscalated(candidate, playbook, countryCode, countryName, objective,
          `${reason} Same-tier schema repair requested material semantic escalation.`, usageRecords);
      }
      const completed={ ...normalized, warnings: [
        `${reason} Same-tier single-candidate schema repair succeeded.`,
        ...normalized.warnings,
      ] };
      if(routine.response.modelVersion===this.routineModel&&(!routine.response.actualProviderId||routine.response.actualProviderId===this.provider.id.replace(/^resilient:/,""))){
        const contract=this.provider.cacheIdentity?.(this.request([candidate],playbook,countryCode,countryName,objective,this.routineModel));
        if(contract)this.exactAssessmentContracts.set(completed,contract);
      }
      return completed;
    } catch (error) {
      if(error instanceof BudgetDeniedError)throw error;
      return failedAssessment(candidate,
        `${reason} Same-tier schema repair failed without Pro escalation: ${error instanceof Error ? error.message : String(error)}`,
        this.promptVersion);
    }
  }

  private async evaluateOneEscalated(candidate: CorrectedLeadWorkflowCandidate, playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, reason: string,
    usageRecords: WorkflowModelUsage[]): Promise<LeadCandidateAssessment> {
    try {
      const escalation = await withCompanyCostAttribution([candidate],countryCode,()=>this.provider.execute<LeadAssessmentRequest, unknown>(
        this.request([candidate], playbook, countryCode, countryName, objective, this.escalationModel),
        AbortSignal.timeout(120_000),
      ));
      usageRecords.push({ stage: "qualification", requestedModel: escalation.requestedModelVersion ?? this.escalationModel,
        actualModel: escalation.modelVersion, providerId: escalation.actualProviderId,
        promptTokens: escalation.usage?.promptTokens ?? 0, completionTokens: escalation.usage?.completionTokens ?? 0,
        reasoningTokens: escalation.usage?.reasoningTokens ?? 0, totalTokens: escalation.usage?.totalTokens ?? 0,
        latencyMs: escalation.latencyMs, fallbackUsed: Boolean(escalation.requestedModelVersion
          && (escalation.requestedModelVersion !== escalation.modelVersion || escalation.actualProviderId !== "deepseek")),
        attempts: escalation.attempts, retries: escalation.retries,
        accountCashCostUsd: escalation.usage?.accountCashCostUsd });
      const envelope=typeof escalation.output==="object"&&escalation.output!==null&&"assessments" in escalation.output
        ?escalation.output:{assessments:[escalation.output]};
      const validated=validateBatchItems<QualificationModelOutput>(envelope,"assessments",
        validatedAssessmentSchema(this.includeCooperationPaths),[candidate.candidateId]);
      if(!validated.complete)throw new Error("Escalation did not return exactly the requested candidate");
      const parsed=validated.items[0];
      const allowOemOdm = /\b(?:oem|odm|private[ -]?label|manufactur(?:e|ing))\b/i.test(objective);
      const normalized = normalizeAssessment(parsed, candidate, escalation, true, allowOemOdm,
        this.includeCooperationPaths);
      return { ...normalized, warnings: [reason, ...normalized.warnings] };
    } catch (error) {
      if(error instanceof BudgetDeniedError)throw error;
      return failedAssessment(candidate,
        `${reason} Escalation failed: ${error instanceof Error ? error.message : String(error)}`,
        this.promptVersion);
    }
  }

  private async evaluateWithCollector(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string,
    usageRecords: WorkflowModelUsage[],onBatchCompleted?:(candidates:CorrectedLeadWorkflowCandidate[],assessments:LeadCandidateAssessment[])=>Promise<void>,
    phaseScope?:QualificationPhaseScope): Promise<LeadCandidateAssessment[]> {
    const {ready,oversized}=this.requestableCandidates(candidates.filter(candidate=>roleScoringAnchors(candidate.correction)),
      playbook,countryCode,countryName,objective);
    const deferred = candidates.filter(candidate=>!roleScoringAnchors(candidate.correction)).map(candidate=>
      failedAssessment(candidate, "Primary role family/subtype is incomplete or inconsistent; resolve correction before scoring. No scoring request was sent.", this.promptVersion));
    const batches=leadRequestBatches(ready,items=>this.request(
      items,playbook,countryCode,countryName,objective,this.routineModel,
    ),this.batchSize,this.maxBatchInputCharacters,this.provider.requestBytes?.bind(this.provider));
    const results = new Array<LeadCandidateAssessment[]>(batches.length);
    const published=new Set<LeadCandidateAssessment>();
    let publicationFailed=false;
    const publish=async(items:CorrectedLeadWorkflowCandidate[],assessments:LeadCandidateAssessment[])=>{
      if(!onBatchCompleted)return true;
      const fresh=assessments.filter(item=>item.scoringStatus==="completed"&&!published.has(item));if(!fresh.length)return true;
      for(const item of fresh)published.add(item);
      const ids=new Set(fresh.map(item=>item.candidateId));
      try{await onBatchCompleted(items.filter(item=>ids.has(item.candidateId)),fresh);return true;}
      catch{publicationFailed=true;console.warn(JSON.stringify({event:"assessment-batch-cache-write-unavailable",replay:false}));return false;}
    };
    let cursor = 0;
    async function worker(agent: LeadQualificationAgent): Promise<void> {
      while (true) {
        if(publicationFailed)return;
        const index = cursor++;
        if (index >= batches.length) return;
        results[index] = await agent.evaluateBatch(batches[index], playbook, countryCode, countryName, objective, usageRecords,publish,()=>publicationFailed);
        await publish(batches[index],results[index]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, batches.length) }, () => worker(this)));
    for(const candidate of candidates){
      const error=oversized.get(candidate.candidateId);
      if(!error)continue;
      if(!phaseScope||publicationFailed){deferred.push(failedAssessment(candidate,
        `Complete scoring request exceeds the approved byte limit (${error.message}); this company remains pending. No scoring request was sent.`,
        this.promptVersion));continue;}
      const assessed=await this.evaluatePhased(candidate,playbook,countryCode,countryName,objective,
        phaseScope,usageRecords);
      deferred.push(assessed);
      await publish([candidate],[assessed]);
    }
    const byId = new Map([...deferred, ...results.filter((result):result is LeadCandidateAssessment[]=>Boolean(result)).flat()]
      .map(item=>[item.candidateId,item]));
    return candidates.map(candidate=>byId.get(candidate.candidateId)
      ??deferredAfterCacheFailure(candidate,this.promptVersion));
  }

  async evaluate(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string): Promise<LeadCandidateAssessment[]> {
    return this.evaluateWithCollector(candidates, playbook, countryCode, countryName, objective, []);
  }

  async evaluateWithUsage(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook,
    countryCode: string, countryName: string, objective: string,
    onBatchCompleted?:(candidates:CorrectedLeadWorkflowCandidate[],assessments:LeadCandidateAssessment[])=>Promise<void>,
    phaseScope?:QualificationPhaseScope) {
    const usage: WorkflowModelUsage[] = [];
    const assessments = await this.evaluateWithCollector(candidates, playbook, countryCode, countryName, objective, usage,onBatchCompleted,phaseScope);
    return { assessments, usage };
  }
}
