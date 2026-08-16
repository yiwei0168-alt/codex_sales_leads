import type { ContactEvidenceAssessment, ContactVerificationInput } from "@/lib/contacts/verification/types";

export interface ContactVerificationEval {
  id: string;
  description: string;
  input: ContactVerificationInput;
  expectedCategory: "Official" | "HighConfidence" | "NeedsReview";
  expectedLifecycle: "Active" | "Invalid";
}

const requestedAt = "2026-08-16T00:00:00.000Z";

function evidence(overrides: Partial<ContactEvidenceAssessment> = {}): ContactEvidenceAssessment {
  return {
    evidenceId: "00000000-0000-4000-8000-000000000501",
    sourceType: "OfficialWebsite",
    acquisitionMethod: "PermittedCrawl",
    acquisitionAuthorized: true,
    sourceKey: "company.mx",
    capturedAt: "2026-08-01T00:00:00.000Z",
    exactEmailPresent: true,
    personPresent: false,
    rolePresent: false,
    currentEmploymentPresent: false,
    historicalEmploymentPresent: false,
    personEmailBound: false,
    conflict: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ContactVerificationInput> = {}): ContactVerificationInput {
  return {
    company: {
      id: "company-1",
      canonicalName: "Company Mexico",
      officialDomains: ["company.mx"],
      localEmployeeCount: 25,
    },
    candidate: { email: "info@company.mx", derivation: "direct-public" },
    evidence: [evidence()],
    emailTechnical: { syntaxValid: true, companyDomainMatches: true, mailRouting: "Valid", disposable: false },
    requestedAt,
    ...overrides,
  };
}

const namedCandidate = {
  fullName: "María López",
  jobTitle: "Directora Comercial",
  email: "maria.lopez@company.mx",
  derivation: "direct-public" as const,
};

export const contactVerificationEvals: ContactVerificationEval[] = [
  {
    id: "official-small-info",
    description: "A small company's official info mailbox remains official and relatively reachable.",
    input: baseInput({ company: { ...baseInput().company, localEmployeeCount: 8 } }),
    expectedCategory: "Official",
    expectedLifecycle: "Active",
  },
  {
    id: "official-enterprise-sales",
    description: "A large company's sales mailbox remains official even though size lowers reachability.",
    input: baseInput({
      company: { ...baseInput().company, localEmployeeCount: 2_500, centralizedSupport: true },
      candidate: { email: "sales@company.mx", derivation: "direct-public" },
    }),
    expectedCategory: "Official",
    expectedLifecycle: "Active",
  },
  {
    id: "third-party-general-mailbox",
    description: "A general mailbox found only on an external directory is not official.",
    input: baseInput({ evidence: [evidence({ sourceType: "BusinessDirectory", acquisitionMethod: "SearchIndex", sourceKey: "directory.mx" })] }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Active",
  },
  {
    id: "official-named-person",
    description: "An official page directly binds a current commercial director to a corporate email.",
    input: baseInput({
      candidate: namedCandidate,
      evidence: [evidence({ personPresent: true, rolePresent: true, currentEmploymentPresent: true, personEmailBound: true })],
    }),
    expectedCategory: "HighConfidence",
    expectedLifecycle: "Active",
  },
  {
    id: "linkedin-role-without-email",
    description: "A LinkedIn search-index record is useful role evidence but cannot validate an unseen email.",
    input: baseInput({
      candidate: { ...namedCandidate, derivation: "unknown" },
      evidence: [evidence({
        sourceType: "LinkedInProfile", acquisitionMethod: "SearchIndex", sourceKey: "linkedin.com/in/maria",
        exactEmailPresent: false, personPresent: true, rolePresent: true, currentEmploymentPresent: true,
      })],
    }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Active",
  },
  {
    id: "linkedin-plus-professional-email",
    description: "Authorized LinkedIn employment plus an independent professional email source clears the high-confidence gates.",
    input: baseInput({
      candidate: { ...namedCandidate, derivation: "cross-source" },
      evidence: [
        evidence({
          sourceType: "LinkedInProfile", acquisitionMethod: "UserSupplied", sourceKey: "linkedin.com/in/maria",
          exactEmailPresent: false, personPresent: true, rolePresent: true, currentEmploymentPresent: true,
        }),
        evidence({
          evidenceId: "00000000-0000-4000-8000-000000000502", sourceType: "PublicProfessionalSource",
          acquisitionMethod: "SearchIndex", sourceKey: "event.mx", personPresent: true, rolePresent: true,
          currentEmploymentPresent: true, personEmailBound: true,
        }),
      ],
    }),
    expectedCategory: "HighConfidence",
    expectedLifecycle: "Active",
  },
  {
    id: "pattern-guessed-person",
    description: "A guessed personalized email remains in review even when the person and role are official.",
    input: baseInput({
      candidate: { ...namedCandidate, derivation: "pattern-guessed" },
      evidence: [evidence({ exactEmailPresent: false, personPresent: true, rolePresent: true, currentEmploymentPresent: true })],
    }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Active",
  },
  {
    id: "wrong-company-domain",
    description: "A personal contact using an unrelated domain cannot pass company-email gates.",
    input: baseInput({
      candidate: { ...namedCandidate, email: "maria.lopez@unrelated.example" },
      emailTechnical: { ...baseInput().emailTechnical, companyDomainMatches: false },
    }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Active",
  },
  {
    id: "permanent-mailbox-failure",
    description: "A recipient-domain 5.1.1 result invalidates the address.",
    input: baseInput({ emailTechnical: { ...baseInput().emailTechnical, enhancedStatusCode: "5.1.1" } }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Invalid",
  },
  {
    id: "sender-policy-rejection",
    description: "A policy rejection does not invalidate an otherwise official address.",
    input: baseInput({ emailTechnical: { ...baseInput().emailTechnical, deliveryStatus: "PolicyRejected" } }),
    expectedCategory: "Official",
    expectedLifecycle: "Active",
  },
  {
    id: "employment-conflict",
    description: "Conflicting current-employment evidence routes a named contact to review.",
    input: baseInput({
      candidate: namedCandidate,
      evidence: [evidence({ personPresent: true, rolePresent: true, currentEmploymentPresent: true, personEmailBound: true, conflict: true })],
    }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Active",
  },
  {
    id: "no-evidence",
    description: "A syntactically valid address without retained evidence remains in review.",
    input: baseInput({ candidate: { ...namedCandidate, derivation: "unknown" }, evidence: [] }),
    expectedCategory: "NeedsReview",
    expectedLifecycle: "Active",
  },
];
