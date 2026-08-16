export type ContactCategory = "Official" | "HighConfidence" | "NeedsReview";
export type ContactLifecycleStatus = "Active" | "Invalid";
export type ContactType = "GeneralMailbox" | "NamedPerson" | "Unknown";
export type EmploymentStatus = "Confirmed" | "Probable" | "Historical" | "Conflicting" | "Unknown";
export type EmailEvidenceStatus =
  | "OfficialPublic"
  | "CrossConfirmed"
  | "ThirdPartyPublic"
  | "PatternGuessed"
  | "Conflicting"
  | "Unknown";
export type DeliveryStatus =
  | "NotTested"
  | "MxValid"
  | "AcceptedByServer"
  | "NoNegativeSignal"
  | "TemporaryFailure"
  | "PolicyRejected"
  | "HardBounced"
  | "RecipientConfirmed";

export type ContactSourceType =
  | "OfficialWebsite"
  | "LinkedInProfile"
  | "LinkedInCompany"
  | "PublicProfessionalSource"
  | "BusinessDirectory"
  | "SearchSnippet";

export type EvidenceAcquisitionMethod =
  | "AuthorizedApi"
  | "PermittedCrawl"
  | "UserSupplied"
  | "SearchIndex"
  | "DirectCrawl";

export interface ContactEvidenceAssessment {
  evidenceId: string;
  sourceType: ContactSourceType;
  acquisitionMethod: EvidenceAcquisitionMethod;
  acquisitionAuthorized: boolean;
  sourceKey: string;
  capturedAt: string;
  publishedAt?: string;
  exactEmailPresent: boolean;
  personPresent: boolean;
  rolePresent: boolean;
  currentEmploymentPresent: boolean;
  historicalEmploymentPresent?: boolean;
  personEmailBound: boolean;
  conflict?: boolean;
}

export interface ContactVerificationInput {
  company: {
    id: string;
    canonicalName: string;
    officialDomains: string[];
    employeeCount?: number;
    localEmployeeCount?: number;
    ownerLed?: boolean;
    localBranchChannel?: boolean;
    singlePublicChannel?: boolean;
    centralizedSupport?: boolean;
    supportOnly?: boolean;
    multiStageRouting?: boolean;
  };
  candidate: {
    fullName?: string;
    jobTitle?: string;
    email?: string;
    derivation: "direct-public" | "cross-source" | "pattern-guessed" | "unknown";
  };
  evidence: ContactEvidenceAssessment[];
  emailTechnical: {
    syntaxValid: boolean;
    companyDomainMatches: boolean;
    mailRouting: "Valid" | "Invalid" | "Unknown";
    disposable: boolean;
    deliveryStatus?: DeliveryStatus;
    enhancedStatusCode?: string;
    manuallyInvalid?: boolean;
  };
  requestedAt: string;
}

export interface ContactVerificationDecision {
  category: ContactCategory;
  lifecycleStatus: ContactLifecycleStatus;
  contactType: ContactType;
  confidenceScore: number;
  roleRelevanceScore: number;
  reachabilityScore: number;
  developmentPriority: number;
  employmentStatus: EmploymentStatus;
  emailEvidenceStatus: EmailEvidenceStatus;
  deliveryStatus: DeliveryStatus;
  matchedRuleIds: string[];
  evidenceIds: string[];
  reasons: string[];
  reviewFlags: string[];
  decidedAt: string;
}
