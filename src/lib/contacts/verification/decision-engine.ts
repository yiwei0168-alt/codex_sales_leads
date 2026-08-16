import type {
  ContactEvidenceAssessment,
  ContactSourceType,
  ContactVerificationDecision,
  ContactVerificationInput,
  DeliveryStatus,
  EmailEvidenceStatus,
  EmploymentStatus,
} from "./types";

const genericMailboxScores: Record<string, number> = {
  sales: 60,
  ventas: 60,
  comercial: 60,
  info: 45,
  contact: 45,
  contacto: 45,
  support: 25,
  soporte: 25,
  admin: 20,
  administracion: 20,
  office: 20,
};

const sourceScores: Record<ContactSourceType, number> = {
  OfficialWebsite: 30,
  LinkedInProfile: 30,
  LinkedInCompany: 28,
  PublicProfessionalSource: 20,
  BusinessDirectory: 8,
  SearchSnippet: 3,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function emailParts(email?: string): { local: string; domain: string } | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return null;
  return { local: normalized.slice(0, separator), domain: normalized.slice(separator + 1) };
}

export function isGeneralMailbox(email?: string): boolean {
  const parts = emailParts(email);
  return parts ? parts.local in genericMailboxScores : false;
}

function eligibleEvidence(item: ContactEvidenceAssessment): boolean {
  const isLinkedIn = item.sourceType === "LinkedInProfile" || item.sourceType === "LinkedInCompany";
  return !isLinkedIn || item.acquisitionAuthorized;
}

function sourceScore(item: ContactEvidenceAssessment): number {
  if (!eligibleEvidence(item)) return 0;
  if ((item.sourceType === "LinkedInProfile" || item.sourceType === "LinkedInCompany") && item.acquisitionMethod === "SearchIndex") {
    return 12;
  }
  return sourceScores[item.sourceType];
}

function monthsOld(dateValue: string, requestedAt: string): number {
  const date = new Date(dateValue);
  const requested = new Date(requestedAt);
  if (Number.isNaN(date.valueOf()) || Number.isNaN(requested.valueOf())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (requested.valueOf() - date.valueOf()) / (30.44 * 24 * 60 * 60 * 1_000));
}

function employmentStatus(evidence: ContactEvidenceAssessment[]): EmploymentStatus {
  const eligible = evidence.filter(eligibleEvidence);
  if (eligible.some((item) => item.conflict)) return "Conflicting";
  if (eligible.some((item) => item.currentEmploymentPresent &&
    ["OfficialWebsite", "LinkedInProfile", "LinkedInCompany"].includes(item.sourceType))) return "Confirmed";
  if (eligible.some((item) => item.currentEmploymentPresent)) return "Probable";
  if (eligible.some((item) => item.historicalEmploymentPresent)) return "Historical";
  return "Unknown";
}

function emailEvidenceStatus(input: ContactVerificationInput): EmailEvidenceStatus {
  if (input.evidence.some((item) => eligibleEvidence(item) && item.conflict)) return "Conflicting";
  if (input.candidate.derivation === "pattern-guessed") return "PatternGuessed";
  const officialExact = input.evidence.some((item) => eligibleEvidence(item) && item.sourceType === "OfficialWebsite" && item.exactEmailPresent);
  if (officialExact) return "OfficialPublic";
  const independentExactSources = new Set(input.evidence
    .filter((item) => eligibleEvidence(item) && item.exactEmailPresent && sourceScore(item) >= 20)
    .map((item) => item.sourceKey));
  if (independentExactSources.size >= 2) return "CrossConfirmed";
  if (input.evidence.some((item) => eligibleEvidence(item) && item.exactEmailPresent)) return "ThirdPartyPublic";
  return "Unknown";
}

function roleRelevance(jobTitle: string | undefined, generalMailbox: boolean, email?: string): number {
  if (generalMailbox) {
    const local = emailParts(email)?.local;
    if (!local) return 20;
    if (["sales", "ventas", "comercial"].includes(local)) return 60;
    if (["support", "soporte", "admin", "administracion", "office"].includes(local)) return 20;
    return 35;
  }
  if (!jobTitle) return 20;
  const title = jobTitle.toLowerCase();
  if (/owner|founder|fundador|ceo|president|presidente|director general/.test(title)) return 100;
  if (/procurement|purchas|compras|adquisiciones|sourcing/.test(title)) return 95;
  if (/director|directora|vp|vicepresident|gerente general/.test(title)) return 90;
  if (/channel|canal|sales|ventas|commercial|comercial|business development/.test(title)) return 85;
  if (/cto|cio|technology|tecnolog|network|redes|ingenier|technical|t[eé]cnic/.test(title)) return 80;
  if (/manager|gerente|jefe|responsable/.test(title)) return 70;
  if (/assistant|asistente|administr|support|soporte|reception|recepci/.test(title)) return 25;
  return 45;
}

function sizeAdjustment(input: ContactVerificationInput): { adjustment: number; unknown: boolean } {
  const size = input.company.localEmployeeCount ?? input.company.employeeCount;
  if (size === undefined) return { adjustment: 0, unknown: true };
  if (size <= 10) return { adjustment: 25, unknown: false };
  if (size <= 50) return { adjustment: 15, unknown: false };
  if (size <= 200) return { adjustment: 0, unknown: false };
  if (size <= 1_000) return { adjustment: -15, unknown: false };
  return { adjustment: -25, unknown: false };
}

function reachabilityScore(input: ContactVerificationInput, generalMailbox: boolean, status: EmailEvidenceStatus): { score: number; sizeUnknown: boolean } {
  if (!generalMailbox) {
    let score = 80;
    if (status === "OfficialPublic") score += 10;
    if (status === "CrossConfirmed") score += 5;
    if (status === "ThirdPartyPublic") score -= 10;
    if (status === "PatternGuessed") score -= 30;
    return { score: clamp(score), sizeUnknown: false };
  }
  const local = emailParts(input.candidate.email)?.local ?? "";
  const size = sizeAdjustment(input);
  let score = genericMailboxScores[local] ?? 35;
  score += size.adjustment;
  if (input.company.ownerLed) score += 15;
  if (input.company.localBranchChannel) score += 10;
  if (input.company.singlePublicChannel) score += 10;
  if (input.company.centralizedSupport) score -= 15;
  if (input.company.supportOnly) score -= 20;
  if (input.company.multiStageRouting) score -= 15;
  return { score: clamp(score), sizeUnknown: size.unknown };
}

function confidenceScore(
  input: ContactVerificationInput,
  employment: EmploymentStatus,
  emailStatus: EmailEvidenceStatus,
): number {
  const eligible = input.evidence.filter(eligibleEvidence);
  let score = Math.max(0, ...eligible.map(sourceScore));
  score += employment === "Confirmed" ? 20 : employment === "Probable" ? 15 : employment === "Historical" ? 4 : 0;
  score += emailStatus === "OfficialPublic" ? 30
    : emailStatus === "CrossConfirmed" ? 25
      : emailStatus === "ThirdPartyPublic" ? 10
        : emailStatus === "PatternGuessed" ? 4 : 0;
  if (input.emailTechnical.syntaxValid) score += 2;
  if (input.emailTechnical.companyDomainMatches) score += 3;
  if (input.emailTechnical.mailRouting === "Valid") score += 3;
  if (!input.emailTechnical.disposable) score += 2;

  const datedEvidence = eligible.filter((item) => item.publishedAt || item.capturedAt);
  const newestMonths = Math.min(Number.POSITIVE_INFINITY, ...datedEvidence.map((item) => monthsOld(item.publishedAt ?? item.capturedAt, input.requestedAt)));
  score += newestMonths <= 6 ? 5 : newestMonths <= 18 ? 3 : 0;
  const independentStrongSources = new Set(eligible.filter((item) => sourceScore(item) >= 20).map((item) => item.sourceKey));
  if (independentStrongSources.size >= 2) score += 5;

  if (employment === "Conflicting" || emailStatus === "Conflicting") score -= 30;
  if (input.candidate.derivation === "pattern-guessed") score = Math.min(score - 30, 59);
  if (!input.emailTechnical.companyDomainMatches) score -= 25;
  if (eligible.length > 0 && eligible.every((item) => item.sourceType === "SearchSnippet")) score = Math.min(score, 59);
  return clamp(score);
}

function resolvedDeliveryStatus(input: ContactVerificationInput): DeliveryStatus {
  if (input.emailTechnical.enhancedStatusCode === "5.1.1") return "HardBounced";
  if (input.emailTechnical.deliveryStatus) return input.emailTechnical.deliveryStatus;
  if (input.emailTechnical.mailRouting === "Valid") return "MxValid";
  return "NotTested";
}

export function verifyContact(input: ContactVerificationInput): ContactVerificationDecision {
  const matchedRuleIds: string[] = [];
  const reasons: string[] = [];
  const reviewFlags: string[] = [];
  const generalMailbox = isGeneralMailbox(input.candidate.email);
  const contactType = generalMailbox ? "GeneralMailbox" : input.candidate.fullName ? "NamedPerson" : "Unknown";
  const employment = employmentStatus(input.evidence);
  const emailStatus = emailEvidenceStatus(input);
  const deliveryStatus = resolvedDeliveryStatus(input);
  const confidence = confidenceScore(input, employment, emailStatus);
  const role = roleRelevance(input.candidate.jobTitle, generalMailbox, input.candidate.email);
  const reachability = reachabilityScore(input, generalMailbox, emailStatus);

  const unauthorizedLinkedIn = input.evidence.some((item) =>
    (item.sourceType === "LinkedInProfile" || item.sourceType === "LinkedInCompany") && !item.acquisitionAuthorized);
  if (unauthorizedLinkedIn) reviewFlags.push("linkedin-acquisition-not-authorized");
  if (reachability.sizeUnknown) reviewFlags.push("company-size-unknown");
  if (input.candidate.derivation === "pattern-guessed") reviewFlags.push("pattern-guessed");
  if (employment === "Conflicting") reviewFlags.push("employment-conflict");
  if (emailStatus === "Conflicting") reviewFlags.push("email-evidence-conflict");
  if (!input.emailTechnical.companyDomainMatches) reviewFlags.push("company-domain-mismatch");

  const lifecycleStatus = !input.emailTechnical.syntaxValid || input.emailTechnical.mailRouting === "Invalid" ||
    deliveryStatus === "HardBounced" || input.emailTechnical.manuallyInvalid ? "Invalid" : "Active";
  if (lifecycleStatus === "Invalid") {
    matchedRuleIds.push("INVALID-001");
    reasons.push("A durable syntax, routing, hard-bounce, or manual invalidation signal excludes this address.");
  }

  const officialEvidence = input.evidence.some((item) => eligibleEvidence(item) && item.sourceType === "OfficialWebsite" && item.exactEmailPresent);
  const official = lifecycleStatus === "Active" && generalMailbox && officialEvidence && input.emailTechnical.companyDomainMatches;

  const officialPersonBinding = input.evidence.some((item) => eligibleEvidence(item) && item.sourceType === "OfficialWebsite" && item.personEmailBound);
  const strongEmploymentAnchor = input.evidence.some((item) => eligibleEvidence(item) &&
    (item.sourceType === "OfficialWebsite" || item.sourceType === "LinkedInProfile") && item.currentEmploymentPresent);
  const strongExactSources = new Set(input.evidence.filter((item) => eligibleEvidence(item) && item.exactEmailPresent && sourceScore(item) >= 20).map((item) => item.sourceKey));
  const independentEmailProof = officialPersonBinding || (strongEmploymentAnchor && strongExactSources.size >= 1) || strongExactSources.size >= 2;
  const relevantRolePresent = input.evidence.some((item) => eligibleEvidence(item) && item.rolePresent && sourceScore(item) >= 20);
  const highConfidence = lifecycleStatus === "Active" && !generalMailbox && Boolean(input.candidate.fullName && input.candidate.jobTitle) &&
    (employment === "Confirmed" || employment === "Probable") && relevantRolePresent && input.candidate.derivation !== "pattern-guessed" &&
    input.emailTechnical.syntaxValid && input.emailTechnical.companyDomainMatches && input.emailTechnical.mailRouting === "Valid" &&
    independentEmailProof && confidence >= 80 && !reviewFlags.some((flag) => ["linkedin-acquisition-not-authorized", "employment-conflict", "email-evidence-conflict"].includes(flag));

  let category: ContactVerificationDecision["category"] = "NeedsReview";
  if (official) {
    category = "Official";
    matchedRuleIds.push("OFFICIAL-001", "OFFICIAL-SIZE-001");
    reasons.push("A general mailbox is reproduced on the confirmed official company website.");
    reasons.push("Company size changes channel reachability but not official-source authenticity.");
  } else if (highConfidence) {
    category = "HighConfidence";
    matchedRuleIds.push("HIGH-001");
    reasons.push("Named-person employment, role, company-domain, and independent email-evidence gates passed.");
  } else {
    matchedRuleIds.push("REVIEW-001");
    reasons.push("At least one Official or HighConfidence hard gate is incomplete or conflicting.");
  }

  if (input.evidence.some((item) => eligibleEvidence(item) && item.sourceType === "LinkedInProfile" && item.currentEmploymentPresent && item.rolePresent)) {
    matchedRuleIds.push("LINKEDIN-ROLE-001");
    reasons.push("An authorized current LinkedIn profile provides extremely strong employer and role evidence, but not implicit email ownership.");
  }

  return {
    category,
    lifecycleStatus,
    contactType,
    confidenceScore: confidence,
    roleRelevanceScore: role,
    reachabilityScore: reachability.score,
    developmentPriority: clamp(confidence * 0.3 + role * 0.4 + reachability.score * 0.3),
    employmentStatus: employment,
    emailEvidenceStatus: emailStatus,
    deliveryStatus,
    matchedRuleIds,
    evidenceIds: [...new Set(input.evidence.filter(eligibleEvidence).map((item) => item.evidenceId))],
    reasons,
    reviewFlags,
    decidedAt: input.requestedAt,
  };
}
