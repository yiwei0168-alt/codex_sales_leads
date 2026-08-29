import type { CompanyRecord } from "@/lib/domain";

export type ContactStatus = "Public" | "Verified" | "Inferred";
export type EmailCandidateStatus = "Public" | "Verified" | "Pattern-guessed" | "Unknown" | "Invalid";

export interface ContactVerificationDto {
  decisionId: string;
  category: "Official" | "HighConfidence" | "NeedsReview";
  lifecycleStatus: "Active" | "Invalid";
  confidenceScore: number;
  roleRelevanceScore: number;
  reachabilityScore: number;
  developmentPriority: number;
  reasons: string[];
  reviewFlags: string[];
  decidedAt: string;
}

export interface CompanyContactDto {
  id: string;
  fullName: string;
  jobTitle?: string;
  publicProfileUrl?: string;
  sourceUrl: string;
  sourceProvider: string;
  status: ContactStatus;
  confidence: number;
}

export interface CompanyEmailCandidateDto {
  id: string;
  contactId?: string;
  email: string;
  status: EmailCandidateStatus;
  sourceUrl?: string;
  sourceProvider: string;
  derivation?: string;
  confidence: number;
  verification?: ContactVerificationDto;
}

export interface CompanyContactDetailsDto {
  contacts: CompanyContactDto[];
  emails: CompanyEmailCandidateDto[];
  evidenceCount: number;
  providerMix: string[];
  enrichedAt: string;
}

export interface MarketWorkspaceDto {
  id: string;
  slug: string;
  name: string;
  market: string;
  countryCode: string;
  mode: "new-market" | "growth";
  objective: string;
  companies: CompanyRecord[];
  contactsByCompanyId: Record<string, CompanyContactDetailsDto>;
  latestSearch?: {
    provider: string;
    acceptedCount: number;
    creditsUsed: number;
    finishedAt: string;
  };
}

export type CompanyEditablePatch = Partial<Pick<CompanyRecord,
  "accountTier" | "supplyModel" | "brandInvolvement" | "opportunityStage" | "priority" | "owner" | "nextAction"
  | "selectedPathId"
>>;
