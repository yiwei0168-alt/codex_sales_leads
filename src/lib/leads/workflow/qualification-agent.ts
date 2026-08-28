import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { DeepSeekProvider } from "@/providers/deepseek";
import { z } from "zod";

import { MULTI_ROLE_CHANNEL_POLICY } from "../channel-membership";
import { COOPERATION_PATH_POLICY, assessCooperationPathEvidence, type CooperationLane } from "../cooperation-path";
import { LEAD_EVIDENCE_SOURCE_POLICY, assessLeadEvidenceQuality, isDiscoveryOnlyLeadEvidence } from "../evidence-quality";
import { assessNetworkingRelevanceEvidence } from "../networking-relevance";
import { SMALL_LONG_TAIL_POLICY } from "../small-long-tail";
import { leadAssessmentBatchSchema, leadAssessmentModelSchema, type LeadAssessmentModelOutput } from "./schemas";
import type {
  LeadCandidateAssessment,
  CorrectedLeadWorkflowCandidate,
  LeadMarketPlaybook,
} from "./types";

const PROMPT_VERSION = "lead-value-v3-atomic-findings-tristate";

interface LeadAssessmentRequest {
  instructions: string[];
  market: { countryCode: string; countryName: string; objective: string };
  cudyFitBrief: {
    marketHypothesis: string;
    productAngles: string[];
    preferredCompanyTraits: string[];
    ragCitationIds: string[];
  };
  candidates: Array<{
    candidateId: string;
    companyName: string;
    domain: string;
    resolvedRoles: string[];
    resolvedRoleFamilies: string[];
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

function normalizeAssessment(
  value: LeadAssessmentModelOutput,
  candidate: CorrectedLeadWorkflowCandidate,
  response: StructuredAiResponse<unknown>,
  escalated: boolean,
): LeadCandidateAssessment {
  const allowedEvidence = new Set(candidate.evidence.map((item) => item.id));
  const evidenceIds = [...new Set(value.evidenceIds.filter((id) => allowedEvidence.has(id)))];
  const claimEvidence = candidate.evidence.filter((item) => !isDiscoveryOnlyLeadEvidence(item));
  const claimEvidenceText = claimEvidence.flatMap((item) => [item.title, item.excerpt]);
  const networkingEvidence = assessNetworkingRelevanceEvidence(claimEvidenceText);
  const evidenceQuality = assessLeadEvidenceQuality({
    candidateDomain: candidate.domain,
    officialUrl: candidate.officialWebsiteUrl,
    evidence: candidate.evidence,
  });
  const cooperationPaths = (candidate.correction.resolvedFamilies.length > 0
    ? candidate.correction.resolvedFamilies : [candidate.queryFamily])
    .map((family) => assessCooperationPathEvidence({ lane: cooperationLane(family), evidence: claimEvidenceText }));
  const cooperationPath = cooperationPaths.sort((left, right) => right.cap - left.cap)[0];
  const gates = {
    ...value.gates,
    correctedIdentityUsable: corroboratedGate(value.gates.correctedIdentityUsable,
      Boolean(candidate.companyName && candidate.domain) && evidenceQuality.identityConsistent),
    networkingRelevant: corroboratedGate(value.gates.networkingRelevant, networkingEvidence.demonstrated),
  };
  const dimensions = {
    productAndUseCaseFit: clamp(value.dimensions.productAndUseCaseFit, 44),
    cooperationPathAndBuyingInfluence: clamp(value.dimensions.cooperationPathAndBuyingInfluence, 32),
    evidenceAndEntityConfidence: clamp(value.dimensions.evidenceAndEntityConfidence, 20),
    roleIdentificationQuality: candidate.correction.resolvedRoles.length > 0
      ? clamp(value.dimensions.roleIdentificationQuality, 3) : 0,
    channelClassificationQuality: candidate.correction.resolvedFamilies.length > 0
      ? clamp(value.dimensions.channelClassificationQuality, 1) : 0,
  };
  const eligible = Object.values(gates).every((state) => state === "supported");
  const totalScore = eligible ? Math.round(Object.values(dimensions).reduce((sum, score) => sum + score, 0)) : 0;
  const roles = candidate.correction.resolvedRoles;
  const primaryRole = null;
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
    accountTier: value.accountTier,
    evidenceProfileAssessment: evidenceQuality.smallLongTail,
    supplyModel: value.supplyModel,
    brandInvolvement: value.brandInvolvement,
    dimensions,
    dimensionRationales,
    totalScore,
    confidence: clamp(value.confidence, 100),
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
      ...(value.dimensions.cooperationPathAndBuyingInfluence > cooperationPath.cap * 6.4
        ? [`Cooperation-path model score exceeds the deterministic evidence signal of ${(cooperationPath.cap * 6.4).toFixed(1)}/32 and requires review: ${cooperationPath.reason}`] : []),
      ...(evidenceIds.length < value.evidenceIds.length ? ["Model returned unsupported evidence IDs; they were removed."] : [])],
  };
}

function requiresEscalation(candidate: CorrectedLeadWorkflowCandidate, assessment: LeadCandidateAssessment,
  value: LeadAssessmentModelOutput): boolean {
  const deterministicPathWarning = assessment.warnings.some((warning) => warning.includes("requires review"));
  return value.needsEscalation || value.confidence < 70 || candidate.correction.confidence < 75
    || candidate.correction.identityChanged || candidate.correction.routingChanged
    || candidate.evidenceWarnings.length > 0 || deterministicPathWarning
    || Object.values(assessment.gates).some((state) => state !== "supported")
    || (assessment.totalScore >= 40 && assessment.totalScore <= 60);
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
    primaryRole: null,
    accountTier: "Standard",
    evidenceProfileAssessment: {
      profile: "standard", confidence: "none", exceptionEligible: false,
      directSizeSignals: [], structuralSignals: [], longTailSignals: [], largeCompanyOverrides: [],
      reason: "Evidence assessment did not complete.",
    },
    supplyModel: "TBD",
    brandInvolvement: "Standard",
    dimensions: {
      productAndUseCaseFit: 0,
      cooperationPathAndBuyingInfluence: 0,
      evidenceAndEntityConfidence: 0,
      roleIdentificationQuality: 0,
      channelClassificationQuality: 0,
    },
    dimensionRationales: [],
    totalScore: 0,
    confidence: 0,
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
  private readonly concurrency: number;

  constructor(private readonly provider: AiProvider = new DeepSeekProvider(), options: LeadQualificationAgentOptions = {}) {
    this.routineModel = options.routineModel ?? process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-v4-flash";
    this.escalationModel = options.escalationModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.batchSize = Math.max(1, Math.min(5, options.batchSize ?? 5));
    this.concurrency = Math.max(1, Math.min(3, options.concurrency ?? 2));
  }

  private request(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string, modelVersion: string) {
    const input: LeadAssessmentRequest = {
      instructions: [
        "Act as an independent sales-lead qualification agent. Ignore search-provider scores and discovery order.",
        "Assess only supplied evidence. Never invent a company fact, role, country presence, product fit, relationship or evidence ID.",
        "The upstream correction agent owns entity resolution, multi-role classification and channel routing. Treat its output as a claim to verify, but do not reclassify or rewrite it.",
        "Every gate uses supported, not-supported, unknown or conflicting. Missing evidence and failed acquisition are unknown, never not-supported.",
        "Return exactly one rationale for each scoring dimension. Every rationale must cite the supplied atomic finding IDs and evidence IDs that actually support it.",
        "A wrong original search lane is never an eligibility failure. Judge the corrected roles and families against evidence; express residual mistakes only in the low-weight role and channel quality dimensions.",
        "KA is an account tier, not a channel role. ISP is a downstream channel role.",
        "Set networkingRelevant=true only when supplied evidence explicitly shows selling, distributing, specifying, buying, designing, installing, deploying or maintaining active networking hardware, or a WLAN/LAN implementation that directly requires it.",
        "Active networking includes routers, gateways, cellular CPE, access points, mesh/WLAN controllers, Ethernet/PoE switches, modems, outdoor/PtP wireless, network firewalls, security gateways and network-management controllers. A named relevant vendor relationship or concrete project can also prove the gate.",
        "Generic IT infrastructure, cloud connectivity, edge infrastructure, managed IT, IP solutions, system integration, network consulting, data centers, broadcast IP and IT procurement do not prove networking relevance without concrete products, vendors, projects or actions.",
        "Pure structured cabling, fiber or low-voltage work can prove an Installer role but does not pass networkingRelevant without active-equipment evidence. Report absent public proof as not demonstrated, not as a factual claim that the company is unrelated.",
        "Treat search snippets, provider summaries and AI-generated summaries as discovery only, never as standalone proof. Link every material claim to a supplied URL and concrete excerpt.",
        "Confirm that the corrected company name, official URL/domain and evidence entity refer to the same business. A wrong or unmatched final identity fails correctedIdentityUsable; repeated pages, mirrors and duplicate excerpts count once.",
        "One concrete company-owned official page can be sufficient. Without direct official evidence, a standard candidate normally needs two non-duplicative public origins.",
        "Do not self-assign a small-company evidence exception and do not infer size from sparse results, weak SEO, a simple website, low traffic or missing data. The system derives this profile deterministically from positive evidence; accountTier=Long-tail is a separate commercial label.",
        "A deterministically confirmed or probable small long-tail candidate does not require multiple independent sources: one identity-clear official marketplace store, official company/profile/social page, Google Business-style profile or other concrete auditable public source can support the assessment. Sparse evidence still affects the evidence-confidence score.",
        "Cap cooperation-path strength by demonstrated transaction control: no explicit procurement/listing/quotation/specification/recommendation/deployment control means level 2 at most; one lever means level 3; multiple complementary levers mean level 4.",
        "Reserve cooperation level 5 for an evidenced active transaction/listing/direct-procurement path or a complete repeatable chain. An active public Cudy listing proves the path, but a relationship label alone adds no points. Customer-supplied installation-only work is capped at level 2.",
        "Missing public procurement or control evidence remains unknown rather than a negative fact, but cannot support a higher cooperation score. Company size never raises this score.",
        "Evidence completeness affects evidenceAndEntityConfidence. Do not reject a real, target-market, networking-relevant prospect merely because public evidence is sparse.",
        "Current Cudy relationship has zero fit-score weight. Cudy itself and non-independent entities fail independentProspect.",
        "Only corrected identity usability, company existence, target-country presence, active-networking commercial relevance and prospect independence are eligibility gates.",
        "Use the exact five dimension maxima. Role identification and channel classification together contribute only 4/100 points.",
        "Return one assessment for every candidateId and request escalation for material ambiguity or conflicting evidence.",
      ],
      market: { countryCode, countryName, objective },
      cudyFitBrief: {
        marketHypothesis: playbook.marketHypothesis,
        productAngles: playbook.productAngles,
        preferredCompanyTraits: playbook.preferredCompanyTraits,
        ragCitationIds: playbook.ragCitationIds,
      },
      candidates: candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        companyName: candidate.companyName,
        domain: candidate.domain,
        resolvedRoles: candidate.correction.resolvedRoles,
        resolvedRoleFamilies: candidate.correction.resolvedFamilies,
        correctionReasons: candidate.correction.reasons,
        correctionConfidence: candidate.correction.confidence,
        findings: candidate.correction.findings,
        evidence: candidate.evidence.map((item) => ({
          evidenceId: item.id,
          sourceType: item.sourceType,
          url: item.url,
          title: item.title,
          excerpt: item.excerpt,
        })),
      })),
      scoringRubric: {
        multiRoleChannelPolicy: MULTI_ROLE_CHANNEL_POLICY,
        evidenceSourcePolicy: LEAD_EVIDENCE_SOURCE_POLICY,
        smallLongTailPolicy: SMALL_LONG_TAIL_POLICY,
        cooperationPathPolicy: COOPERATION_PATH_POLICY,
        eligibilityGates: ["correctedIdentityUsable", "companyExists", "targetCountryPresence", "networkingRelevant", "independentProspect"],
        dimensions: {
          productAndUseCaseFit: 44,
          cooperationPathAndBuyingInfluence: 32,
          evidenceAndEntityConfidence: 20,
          roleIdentificationQuality: 3,
          channelClassificationQuality: 1,
        },
        qualifiedThreshold: 50,
        highFitThreshold: 80,
      },
    };
    return {
      task: "lead-qualification" as const,
      modelVersion,
      promptVersion: PROMPT_VERSION,
      input,
      evidenceIds: candidates.flatMap((candidate) => candidate.evidence.map((item) => item.id)),
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
        const normalized = normalizeAssessment(value, candidate, routine.response, false);
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
      const normalized = normalizeAssessment(parsed, candidate, escalation, true);
      return { ...normalized, warnings: [reason, ...normalized.warnings] };
    } catch (error) {
      return failedAssessment(candidate, `${reason} Escalation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async evaluate(candidates: CorrectedLeadWorkflowCandidate[], playbook: LeadMarketPlaybook, countryCode: string, countryName: string, objective: string): Promise<LeadCandidateAssessment[]> {
    const batches: CorrectedLeadWorkflowCandidate[][] = [];
    for (let offset = 0; offset < candidates.length; offset += this.batchSize) batches.push(candidates.slice(offset, offset + this.batchSize));
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
