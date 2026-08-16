import { describe, expect, it, vi } from "vitest";
import type { AiProvider, StructuredAiResponse } from "@/providers/contracts";
import { ContactVerificationAgent, type ContactVerificationAgentInput } from "./agent";

const input: ContactVerificationAgentInput = {
  company: {
    id: "company-1",
    canonicalName: "Company Mexico",
    officialDomains: ["company.mx"],
    localEmployeeCount: 30,
  },
  candidate: {
    fullName: "María López",
    jobTitle: "Directora Comercial",
    email: "maria.lopez@company.mx",
    derivation: "cross-source",
  },
  evidence: [{
    evidenceId: "ev-official",
    sourceType: "OfficialWebsite",
    acquisitionMethod: "PermittedCrawl",
    acquisitionAuthorized: true,
    sourceKey: "company.mx",
    url: "https://company.mx/team",
    title: "Team",
    excerpt: "María López, Directora Comercial — maria.lopez@company.mx",
    capturedAt: "2026-08-01T00:00:00.000Z",
  }],
  emailTechnical: {
    syntaxValid: true,
    companyDomainMatches: true,
    mailRouting: "Valid",
    disposable: false,
  },
  requestedAt: "2026-08-16T00:00:00.000Z",
};

function response(output: unknown, modelVersion = "deepseek-v4-flash"): StructuredAiResponse<unknown> {
  return { output, modelVersion, promptVersion: "contact-evidence-v1", latencyMs: 10, warnings: [], usage: { promptTokens: 10, completionTokens: 10, reasoningTokens: 0, totalTokens: 20 } };
}

describe("ContactVerificationAgent", () => {
  it("runs in shadow mode and lets deterministic rules publish no result automatically", async () => {
    const provider: AiProvider = {
      id: "fake",
      execute: vi.fn().mockResolvedValue(response({
        findings: [{ evidenceId: "ev-official", personPresent: true, rolePresent: true, currentEmploymentPresent: true,
          historicalEmploymentPresent: false, personEmailBound: true, conflict: false, rationale: "Exact official evidence" }],
        needsEscalation: false,
        conflicts: [],
        warnings: [],
      })) as AiProvider["execute"],
    };
    const result = await new ContactVerificationAgent(provider).runShadow(input);

    expect(result.publish).toBe(false);
    expect(result.decision.category).toBe("HighConfidence");
    expect(result.totalTokens).toBe(20);
  });

  it("escalates a conflicting Flash assessment to Pro", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(response({
        findings: [{ evidenceId: "ev-official", personPresent: true, rolePresent: true, currentEmploymentPresent: true,
          historicalEmploymentPresent: false, personEmailBound: true, conflict: true, rationale: "Conflict" }],
        needsEscalation: true,
        conflicts: ["role conflict"],
        warnings: [],
      }))
      .mockResolvedValueOnce(response({
        findings: [{ evidenceId: "ev-official", personPresent: true, rolePresent: true, currentEmploymentPresent: true,
          historicalEmploymentPresent: false, personEmailBound: true, conflict: false, rationale: "Resolved" }],
        needsEscalation: false,
        conflicts: [],
        warnings: [],
      }, "deepseek-v4-pro"));
    const provider: AiProvider = { id: "fake", execute: execute as AiProvider["execute"] };
    const result = await new ContactVerificationAgent(provider).runShadow(input);

    expect(result.escalated).toBe(true);
    expect(result.modelVersion).toBe("deepseek-v4-pro");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("fails closed when model output omits evidence", async () => {
    const provider: AiProvider = {
      id: "fake",
      execute: vi.fn().mockResolvedValue(response({ findings: [], needsEscalation: false, conflicts: [], warnings: [] })) as AiProvider["execute"],
    };
    const result = await new ContactVerificationAgent(provider).runShadow(input);

    expect(result.decision.category).toBe("NeedsReview");
    expect(result.decision.reviewFlags).toContain("model-assessment-failed");
  });
});
