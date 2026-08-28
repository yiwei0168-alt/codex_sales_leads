import type { ChannelRole } from "@/lib/domain";
import type { LeadSearchPlan } from "@/lib/assistant/types";
import type { SmallLongTailAssessment } from "@/lib/leads/small-long-tail";

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
export type LeadClaimStatus = "supported" | "not-supported" | "unknown" | "conflicting";
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
}

export interface LeadWorkflowCandidate {
  candidateId: string;
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
  productAndUseCaseFit: number;
  cooperationPathAndBuyingInfluence: number;
  evidenceAndEntityConfidence: number;
  roleIdentificationQuality: number;
  channelClassificationQuality: number;
}

export interface LeadDimensionRationale {
  dimension: keyof LeadFitDimensions;
  score: number;
  reason: string;
  findingIds: string[];
  evidenceIds: string[];
  confidence: number;
}

export interface LeadCandidateAssessment {
  candidateId: string;
  eligible: boolean;
  gates: LeadEligibilityGates;
  roles: ChannelRole[];
  primaryRole: ChannelRole | null;
  accountTier: "KA" | "Priority" | "Standard" | "Long-tail";
  evidenceProfileAssessment?: SmallLongTailAssessment;
  supplyModel: "Distributor Supply" | "Brand Direct" | "Co-sell/Co-supply" | "TBD";
  brandInvolvement: "Light" | "Standard" | "Deep";
  dimensions: LeadFitDimensions;
  dimensionRationales: LeadDimensionRationale[];
  totalScore: number;
  confidence: number;
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
  creditsUsed: number;
  warnings: string[];
  result?: LeadWorkflowResult;
}
