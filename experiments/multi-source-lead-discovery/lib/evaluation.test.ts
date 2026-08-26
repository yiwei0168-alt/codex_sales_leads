import { afterEach, describe, expect, it, vi } from "vitest";

import { candidateScore, canonicalPublicUrl, evaluateChannel, sanitizeText } from "./evaluation";

afterEach(() => vi.unstubAllEnvs());

describe("provider-neutral benchmark evaluation", () => {
  it("calculates the frozen 45/35/20 score", () => {
    expect(candidateScore({ productUseCaseFit: 5, cooperationPath: 4, evidenceReliability: 3 })).toBe(85);
  });

  it("redacts personal contacts and tracking parameters from committed evidence", () => {
    expect(sanitizeText("Mail jane@example.de or +49 30 1234 5678")).toBe("Mail [redacted-email] or [redacted-phone]");
    expect(canonicalPublicUrl("https://example.de/partner?utm_source=test&id=3#contact"))
      .toBe("https://example.de/partner?id=3");
  });

  it("recomputes scores and applies failed gates as zero", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "private-key");
    vi.stubEnv("CLAUDE_BASE_URL", "https://lingyuapi.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "claude-sonnet-4-6-actual",
      content: [{ type: "text", text: JSON.stringify({
        selectedCandidates: [{
          companyName: "Example GmbH",
          officialUrl: "https://example.de/?utm_source=x",
          roles: ["Reseller"],
          eligibility: {
            companyExists: true, germanyPresence: true, networkingRelevant: true,
            submittedChannelRole: false, sufficientEvidence: true, uniqueWithinList: true,
          },
          levels: { productUseCaseFit: 5, cooperationPath: 5, evidenceReliability: 5 },
          evidenceItems: [{ url: "https://example.de", excerpt: "sales@example.de +49 30 1234 5678" }],
        }],
        rejectedItems: [],
      }) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }), { status: 200 }));
    const result = await evaluateChannel({
      channelId: "b2b-resale",
      channelLabel: "B2B resale",
      eligibleRoles: ["Reseller"],
      roleRules: [],
      cudyBrief: "brief",
      commonBrief: "common",
      configuration: {
        model: "claude-sonnet-4-6", temperature: 0, maxOutputTokens: 1000,
        systemPrompt: "system", taskPrompt: "task", fixedListEvaluationPrompt: "fixed",
      },
      discoveryItems: [],
      fetchImplementation: fetchMock,
    });
    expect(result.selectedCandidates[0].score).toBe(0);
    expect(result.selectedCandidates[0].evidenceItems[0].excerpt).not.toContain("@");
    expect(result.evaluator.returnedModel).toBe("claude-sonnet-4-6-actual");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.temperature).toBe(0);
    expect(JSON.stringify(request)).not.toContain("private-key");
  });
});
