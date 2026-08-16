import { describe, expect, it } from "vitest";
import { verifyContact, isGeneralMailbox } from "./decision-engine";
import type { ContactEvidenceAssessment, ContactVerificationInput } from "./types";

const requestedAt = "2026-08-16T00:00:00.000Z";

function evidence(overrides: Partial<ContactEvidenceAssessment> = {}): ContactEvidenceAssessment {
  return {
    evidenceId: "ev-official",
    sourceType: "OfficialWebsite",
    acquisitionMethod: "PermittedCrawl",
    acquisitionAuthorized: true,
    sourceKey: "company.mx",
    capturedAt: "2026-08-01T00:00:00.000Z",
    exactEmailPresent: true,
    personPresent: false,
    rolePresent: false,
    currentEmploymentPresent: false,
    personEmailBound: false,
    ...overrides,
  };
}

function input(overrides: Partial<ContactVerificationInput> = {}): ContactVerificationInput {
  return {
    company: {
      id: "company-1",
      canonicalName: "Company Mexico",
      officialDomains: ["company.mx"],
      localEmployeeCount: 25,
    },
    candidate: {
      email: "info@company.mx",
      derivation: "direct-public",
    },
    evidence: [evidence()],
    emailTechnical: {
      syntaxValid: true,
      companyDomainMatches: true,
      mailRouting: "Valid",
      disposable: false,
    },
    requestedAt,
    ...overrides,
  };
}

describe("contact verification decision engine", () => {
  it("classifies an official general mailbox without reducing authenticity for company size", () => {
    const small = verifyContact(input());
    const large = verifyContact(input({ company: { ...input().company, localEmployeeCount: 2_000 } }));

    expect(isGeneralMailbox("ventas@company.mx")).toBe(true);
    expect(small.category).toBe("Official");
    expect(large.category).toBe("Official");
    expect(small.confidenceScore).toBe(75);
    expect(large.confidenceScore).toBe(small.confidenceScore);
    expect(small.reachabilityScore).toBeGreaterThan(large.reachabilityScore);
  });

  it("uses authorized LinkedIn as extremely strong role evidence without treating it as implicit email proof", () => {
    const linkedin = evidence({
      evidenceId: "ev-linkedin",
      sourceType: "LinkedInProfile",
      acquisitionMethod: "PermittedCrawl",
      acquisitionAuthorized: true,
      sourceKey: "linkedin.com/in/maria",
      exactEmailPresent: false,
      personPresent: true,
      rolePresent: true,
      currentEmploymentPresent: true,
    });
    const result = verifyContact(input({
      candidate: { fullName: "María López", jobTitle: "Directora Comercial", email: "maria.lopez@company.mx", derivation: "unknown" },
      evidence: [linkedin],
    }));

    expect(result.employmentStatus).toBe("Confirmed");
    expect(result.matchedRuleIds).toContain("LINKEDIN-ROLE-001");
    expect(result.category).toBe("NeedsReview");
    expect(result.emailEvidenceStatus).toBe("Unknown");
  });

  it("accepts a named role when LinkedIn and a strong independent email source agree", () => {
    const linkedin = evidence({
      evidenceId: "ev-linkedin",
      sourceType: "LinkedInProfile",
      acquisitionMethod: "PermittedCrawl",
      acquisitionAuthorized: true,
      sourceKey: "linkedin.com/in/maria",
      exactEmailPresent: false,
      personPresent: true,
      rolePresent: true,
      currentEmploymentPresent: true,
    });
    const event = evidence({
      evidenceId: "ev-event",
      sourceType: "PublicProfessionalSource",
      sourceKey: "industry-event.mx",
      exactEmailPresent: true,
      personPresent: true,
      rolePresent: true,
      currentEmploymentPresent: true,
      personEmailBound: true,
    });
    const result = verifyContact(input({
      candidate: { fullName: "María López", jobTitle: "Directora Comercial", email: "maria.lopez@company.mx", derivation: "cross-source" },
      evidence: [linkedin, event],
    }));

    expect(result.category).toBe("HighConfidence");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.roleRelevanceScore).toBe(90);
  });

  it("does not use unauthorized direct LinkedIn crawling to auto-accept a contact", () => {
    const result = verifyContact(input({
      candidate: { fullName: "María López", jobTitle: "Directora Comercial", email: "maria.lopez@company.mx", derivation: "cross-source" },
      evidence: [evidence({
        sourceType: "LinkedInProfile",
        acquisitionMethod: "DirectCrawl",
        acquisitionAuthorized: false,
        personPresent: true,
        rolePresent: true,
        currentEmploymentPresent: true,
        personEmailBound: true,
      })],
    }));

    expect(result.category).toBe("NeedsReview");
    expect(result.reviewFlags).toContain("linkedin-acquisition-not-authorized");
  });

  it("keeps a pattern guess in review even when syntax and mail routing pass", () => {
    const result = verifyContact(input({
      candidate: { fullName: "María López", jobTitle: "Directora Comercial", email: "maria.lopez@company.mx", derivation: "pattern-guessed" },
      evidence: [evidence({ personPresent: true, rolePresent: true, currentEmploymentPresent: true, exactEmailPresent: false })],
    }));

    expect(result.category).toBe("NeedsReview");
    expect(result.confidenceScore).toBeLessThanOrEqual(59);
    expect(result.reviewFlags).toContain("pattern-guessed");
  });

  it("invalidates only a durable mailbox failure and does not equate policy rejection with an invalid recipient", () => {
    const hardBounce = verifyContact(input({
      emailTechnical: { ...input().emailTechnical, enhancedStatusCode: "5.1.1" },
    }));
    const policyRejected = verifyContact(input({
      emailTechnical: { ...input().emailTechnical, deliveryStatus: "PolicyRejected" },
    }));

    expect(hardBounce.lifecycleStatus).toBe("Invalid");
    expect(hardBounce.deliveryStatus).toBe("HardBounced");
    expect(policyRejected.lifecycleStatus).toBe("Active");
    expect(policyRejected.deliveryStatus).toBe("PolicyRejected");
  });
});
