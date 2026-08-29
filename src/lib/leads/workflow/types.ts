import type { ChannelRole, CooperationPathType } from "@/lib/domain";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { SmallLongTailAssessment } from "@/lib/leads/small-long-tail";
import type { CooperationPathMemory } from "@/lib/leads/path-memory";

export const ALL_CHANNEL_ROLES: ChannelRole[] = [
  "Distributor", "VAD", "VAR", "Dealer", "Reseller", "Retailer",
  "E-tailer", "SI", "Installer", "MSP", "ISP",
];

export const CHANNEL_ROLE_FAMILIES = {
  distribution: ["Distributor", "VAD"],
  resale: ["VAR", "Dealer", "Reseller"],
  retail: ["Retailer", "E-tailer"],
  services: ["SI", "Installer", "MSP"],
  isp: ["ISP"],
} as const satisfies Record<string, readonly ChannelRole[]>;

export type ChannelRoleFamily = keyof typeof CHANNEL_ROLE_FAMILIES;
export type PrimaryBusinessRole = ChannelRole | "Hybrid" | "Unresolved";
export type LeadClaimStatus = "supported" | "not-supported" | "unknown" | "conflicting";
export type LeadEligibilityStatus = "eligible" | "research-required" | "ineligible-for-current-task"
  | "insufficient-evidence-for-recommendation";
export type LeadResearchDepth = "deep" | "standard" | "limited";
export type CompanyScaleClass = "Global/Enterprise" | "National" | "Regional" | "Local/Small" | "Unknown";
export type RecommendationPriority = "High" | "Medium" | "Low" | "Hold/Research Required";
export type SalesAccountTier = "Strategic Distributor" | "Priority Distributor" | "Standard Distributor"
  | "Long-tail Distributor" | "KA" | "Priority" | "Standard" | "Long-tail";
export type LeadEvidenceFindingKind =
  | "identity"
  | "country-presence"
  | "active-networking"
  | "role"
  | "product-family"
  | "brand-relationship"
  | "commercial-action"
  | "cooperation-path"
  | "company-size"
  | "other";

export interface LeadEvidenceFinding {
  findingId: string;
  kind: LeadEvidenceFindingKind;
  statement: string;
  status: LeadClaimStatus;
  roles: ChannelRole[];
  evidenceIds: string[];
  sourceTypes: LeadEvidenceItem["sourceType"][];
  confidence: number;
  notes: string[];
}
export type LeadWorkflowPhase =
  | "queued"
  | "retrieving-knowledge"
  | "planning"
  | "discovering"
  | "collecting-evidence"
  | "correcting-evidence"
  | "scoring"
  | "reviewing-scores"
  | "assembling-handoff"
  | "persisting"
  | "completed"
  | "failed";

export interface LeadRagCitation {
  chunkId: string;
  collection: "product" | "company" | "industry";
  title: string;
  content: string;
  sourceUrl?: string;
  score: number;
  retrievalSignals: Array<"vector" | "keyword" | "structured">;
  corroborated: boolean;
  structuredFacts: Array<{ model: string; factKey: string; factValue: string; status: string }>;
}

export interface RolePriority {
  family: ChannelRoleFamily;
  roles: ChannelRole[];
  weight: number;
  reason: string;
}

export interface LeadSearchQuerySpec {
  family: ChannelRoleFamily;
  roles: ChannelRole[];
  query: string;
  priority: number;
}

export interface LeadMarketPlaybook {
  marketHypothesis: string;
  productAngles: string[];
  preferredCompanyTraits: string[];
  exclusions: string[];
  rolePriorities: RolePriority[];
  searchQueries: LeadSearchQuerySpec[];
  ragCitationIds: string[];
  generatedBy: "langchain-model" | "deterministic-fallback";
  model?: string;
  cooperationPathMemory?: CooperationPathMemory[];
  warnings: string[];
}

export interface LeadEvidenceItem {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  sourceType: "discovery" | "official-website" | "independent-public";
  provider: string;
  capturedAt: string;
  evidenceRunId?: string;
  contentHash?: string;
  freshnessStatus?: "fresh" | "revalidated" | "stale" | "unknown";
  priorRunId?: string;
}

export interface LeadWorkflowCandidate {
  candidateId: string;
  evidenceSnapshotRunId: string;
  companyName: string;
  domain: string;
  officialWebsiteUrl: string;
  queryRoles: ChannelRole[];
  queryFamily: ChannelRoleFamily;
  providerScore: number;
  evidence: LeadEvidenceItem[];
  evidenceWarnings: string[];
}

export interface LeadCandidateCorrection {
  originalCompanyName: string;
  originalDomain: string;
  originalOfficialWebsiteUrl: string;
  resolvedRoles: ChannelRole[];
  resolvedFamilies: ChannelRoleFamily[];
  primaryRole: PrimaryBusinessRole;
  primaryFamily: ChannelRoleFamily | null;
  primaryChannelReason: string;
  usedSmallLongTailChannelException: boolean;
  identityChanged: boolean;
  routingChanged: boolean;
  supplementalEvidenceIds: string[];
  reliedEvidenceIds: string[];
  findings: LeadEvidenceFinding[];
  reasons: string[];
  confidence: number;
  model: string;
  promptVersion: string;
  escalated: boolean;
  warnings: string[];
}

export interface CorrectedLeadWorkflowCandidate extends LeadWorkflowCandidate {
  correction: LeadCandidateCorrection;
}

export interface LeadEligibilityGates {
  correctedIdentityUsable: LeadClaimStatus;
  companyExists: LeadClaimStatus;
  targetCountryPresence: LeadClaimStatus;
  networkingRelevant: LeadClaimStatus;
  independentProspect: LeadClaimStatus;
}

export interface LeadFitDimensions {
  productFamilyMatch: number;
  customerAndScenarioOverlap: number;
  positioningCompatibility: number;
  cooperationPathAndBuyingInfluence: number;
  scaleAndChannelCoverage: number;
  executionAndEnablement: number;
  opportunityAndRisk: number;
}

export interface LeadDimensionRationale {
  dimension: keyof LeadFitDimensions;
  score: number;
  reason: string;
  findingIds: string[];
  evidenceIds: string[];
  confidence: number;
}

export interface CooperationPathCandidate {
  pathId: string;
  pathType: CooperationPathType;
  candidateRole: ChannelRole;
  pathNodes: Array<{ actor: "Cudy" | "Candidate" | "Intermediary" | "Customer"; role: string }>;
  supplyFlow: string;
  decisionRole: string;
  fitScore: number;
  confidence: number;
  rank: number;
  evidenceIds: string[];
  prerequisites: string[];
  valuePropositions: string[];
  risks: string[];
  unknowns: string[];
  targetTitles: string[];
  recommendedCta: string;
  allowedInExternalEmail: boolean;
}

export interface LeadCandidateAssessment {
  candidateId: string;
  eligible: boolean;
  gates: LeadEligibilityGates;
  roles: ChannelRole[];
  primaryRole: PrimaryBusinessRole;
  companyScaleClass: CompanyScaleClass;
  researchDepth: LeadResearchDepth;
  recommendationPriority: RecommendationPriority;
  accountTier: SalesAccountTier;
  evidenceProfileAssessment?: SmallLongTailAssessment;
  supplyModel: "Distributor Supply" | "Brand Direct" | "Co-sell/Co-supply" | "TBD";
  brandInvolvement: "Light" | "Standard" | "Deep";
  dimensions: LeadFitDimensions;
  dimensionRationales: LeadDimensionRationale[];
  totalScore: number;
  scoreRange: { lower: number; upper: number };
  confidence: number;
  eligibilityStatus: LeadEligibilityStatus;
  cooperationPaths: CooperationPathCandidate[];
  selectedPathId: string | null;
  summary: string;
  reasons: string[];
  risks: string[];
  unknowns: string[];
  evidenceIds: string[];
  model: string;
  promptVersion: string;
  escalated: boolean;
  scoringStatus: "completed" | "retry-required";
  warnings: string[];
}

export type LeadAssessmentReviewStatus =
  | "not-required"
  | "secondary-confirmed"
  | "judge-resolved"
  | "targeted-research-required"
  | "review-failed";

export interface LeadAssessmentReview {
  candidateId: string;
  required: boolean;
  triggers: string[];
  status: LeadAssessmentReviewStatus;
  primaryModel: string;
  secondaryModel?: string;
  judgeModel?: string;
  primaryScore: number;
  secondaryScore?: number;
  finalScore: number;
  materialDisagreements: string[];
  rationale: string;
  researchQuestion?: string;
  warnings: string[];
}

export interface LeadDevelopmentHandoff {
  version: "lead-handoff-v2";
  provenance: {
    candidateId: string;
    runId: string;
    evidenceSnapshotHash: string;
    correctionModel: string;
    scoringModel: string;
    reviewStatus: LeadAssessmentReviewStatus;
  };
  identity: {
    companyName: string;
    officialUrl: string;
    domain: string;
    supportedRoles: ChannelRole[];
    primaryBusinessRole: PrimaryBusinessRole;
  };
  decision: {
    score: number;
    scoreRange: { lower: number; upper: number };
    eligibilityStatus: LeadEligibilityStatus;
    primaryFamily: ChannelRoleFamily | null;
    recommendedFamilies: ChannelRoleFamily[];
    companyScaleClass: CompanyScaleClass;
    researchDepth: LeadResearchDepth;
    recommendationPriority: RecommendationPriority;
    accountTier: SalesAccountTier;
    cooperationPaths: CooperationPathCandidate[];
    selectedPathId: string | null;
    scoreConfidence: number;
    scoringStatus: LeadCandidateAssessment["scoringStatus"];
  };
  externallyUsableFacts: Array<{
    factId: string;
    kind: LeadEvidenceFindingKind;
    statement: string;
    evidenceIds: string[];
    sourceTypes: LeadEvidenceItem["sourceType"][];
    confidence: number;
  }>;
  internalInterpretations: Array<{
    interpretationId: string;
    dimension: keyof LeadFitDimensions;
    statement: string;
    basedOnFactIds: string[];
    confidence: number;
  }>;
  personalizationHooks: Array<{
    hook: string;
    basedOnFactIds: string[];
    allowedInEmail: boolean;
  }>;
  unknowns: string[];
  risks: string[];
  doNotClaim: string[];
  evidenceIndex: Array<{
    evidenceId: string;
    url: string;
    title: string;
    sourceType: LeadEvidenceItem["sourceType"];
  }>;
  quality: {
    readyForStrategy: boolean;
    readyForEmail: boolean;
    conflicts: string[];
    warnings: string[];
  };
}

export interface LeadWorkflowResult {
  runId: string;
  countryCode: string;
  countryName: string;
  requested: number;
  discovered: number;
  assessed: number;
  qualified: number;
  accepted: number;
  creditsUsed: number;
  ragCitationCount: number;
  graphThreadId: string;
  warnings: string[];
}

export interface LeadWorkflowState {
  userId: string;
  actionId: string;
  graphThreadId: string;
  workspaceId: string;
  plan: LeadSearchPlan;
  phase: LeadWorkflowPhase;
  ragContext: LeadRagCitation[];
  playbook?: LeadMarketPlaybook;
  runId?: string;
  candidates: LeadWorkflowCandidate[];
  correctedCandidates: CorrectedLeadWorkflowCandidate[];
  assessments: LeadCandidateAssessment[];
  assessmentReviews: LeadAssessmentReview[];
  handoffs: LeadDevelopmentHandoff[];
  creditsUsed: number;
  warnings: string[];
  result?: LeadWorkflowResult;
}
