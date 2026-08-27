import { afterEach, describe, expect, it, vi } from "vitest";

import { candidateScore, canonicalPublicUrl, evaluateChannel, isUsefulPublicUrl, sanitizeText } from "./evaluation";

afterEach(() => vi.unstubAllEnvs());

describe("provider-neutral benchmark evaluation", () => {
  it("calculates the frozen 45/35/20 score", () => {
    expect(candidateScore({ productUseCaseFit: 5, cooperationPath: 4, evidenceReliability: 3 })).toBe(85);
  });

  it("redacts personal contacts and tracking parameters from committed evidence", () => {
    expect(sanitizeText("Mail jane@example.de or +49 30 1234 5678")).toBe("Mail [redacted-email] or [redacted-phone]");
    expect(canonicalPublicUrl("https://example.de/partner?utm_source=test&id=3#contact"))
      .toBe("https://example.de/partner?id=3");
    expect(sanitizeText("## Workforce - Employees: 4 - Key Executives: - Jane Doe: CEO"))
      .toBe("## Workforce - Employees: 4 [redacted-personnel-section]");
    expect(isUsefulPublicUrl("http://www.w3.org/2000/svg")).toBe(false);
    expect(isUsefulPublicUrl("https://www.google.com/search?q=test")).toBe(false);
  });

  it("recomputes scores and applies failed gates as zero", async () => {
    vi.stubEnv("LINGYU_API_KEY", "private-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "resp_test",
      model: "gpt-5.6-sol-actual",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          selectedCandidates: [{
            companyName: "Example GmbH",
            officialUrl: "https://example.de/?utm_source=x",
            roles: ["Reseller"],
            eligibility: {
              companyExists: true, germanyPresence: true, networkingRelevant: true,
              submittedChannelRole: false, sufficientEvidence: true, uniqueWithinList: true,
            },
            levels: { productUseCaseFit: 5, cooperationPath: 5, evidenceReliability: 5 },
            roleEvidence: "Wrong submitted role",
            productFitEvidence: "Networking products",
            cooperationEvidence: "Resells products",
            evidenceItems: [{ url: "https://example.de", sourceType: "official-company",
              excerpt: "Sells routers and PoE switches. sales@example.de +49 30 1234 5678" }],
            rationale: "Fails the category gate",
          }],
          rejectedItems: [],
        }) }] }],
      usage: { input_tokens: 100, output_tokens: 50, output_tokens_details: { reasoning_tokens: 20 } },
    }), { status: 200 }));
    const result = await evaluateChannel({
      channelId: "b2b-resale",
      channelLabel: "B2B resale",
      eligibleRoles: ["Reseller"],
      roleRules: [],
      cudyBrief: "brief",
      commonBrief: "common",
      configuration: {
        provider: "openai", gateway: "lingyu-openai-compatible",
        apiKeyEnvironmentVariable: "LINGYU_API_KEY", baseUrl: "https://lingyuapi.com/v1",
        model: "gpt-5.6-sol", reasoningEffort: "medium", structuredOutput: "strict-json-schema",
        maxOutputTokens: 1000,
        systemPrompt: "system", taskPrompt: "task", fixedListEvaluationPrompt: "fixed",
      },
      discoveryItems: [],
      fetchImplementation: fetchMock,
    });
    expect(result.selectedCandidates[0].score).toBe(0);
    expect(result.selectedCandidates[0].levels.cooperationPath).toBe(3);
    expect(result.selectedCandidates[0].cooperationPathCap).toBe(3);
    expect(result.selectedCandidates[0].supportedLaneRoles).toContain("Reseller");
    expect(result.selectedCandidates[0].evidenceItems[0].excerpt).not.toContain("@");
    expect(result.evaluator.returnedModel).toBe("gpt-5.6-sol-actual");
    expect(result.evaluator.reasoningTokens).toBe(20);
    expect(fetchMock.mock.calls[0][0]).toBe("https://lingyuapi.com/v1/responses");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.reasoning).toEqual({ effort: "medium" });
    expect(request.text.format.type).toBe("json_schema");
    expect(request.text.format.strict).toBe(true);
    expect(request.temperature).toBeUndefined();
    expect(request.input[1].content).toContain("active-networking-relevance-v1");
    expect(JSON.stringify(request)).not.toContain("private-key");
  });

  it("overrides a model-passed networking gate when evidence is generic only", async () => {
    vi.stubEnv("LINGYU_API_KEY", "private-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      model: "gpt-test",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        selectedCandidates: [{
          companyName: "Generic IT GmbH", officialUrl: "https://generic.example",
          roles: ["SI"],
          eligibility: { companyExists: true, germanyPresence: true, networkingRelevant: true,
            submittedChannelRole: true, sufficientEvidence: true, uniqueWithinList: true },
          levels: { productUseCaseFit: 4, cooperationPath: 4, evidenceReliability: 4 },
          roleEvidence: "System integrator", productFitEvidence: "IT infrastructure",
          cooperationEvidence: "Consulting", evidenceItems: [{ url: "https://generic.example/services", sourceType: "official-company",
            excerpt: "Cloud connectivity, managed IT and structured cabling" }], rationale: "Generic wording",
        }], rejectedItems: [],
      }) }] }],
    }), { status: 200 }));
    const result = await evaluateChannel({
      channelId: "project-services", channelLabel: "Project services", eligibleRoles: ["SI"], roleRules: [],
      cudyBrief: "brief", commonBrief: "common",
      configuration: { provider: "openai", gateway: "lingyu-openai-compatible",
        apiKeyEnvironmentVariable: "LINGYU_API_KEY", baseUrl: "https://lingyuapi.com/v1", model: "gpt-test",
        reasoningEffort: "medium", structuredOutput: "strict-json-schema", maxOutputTokens: 1000,
        systemPrompt: "system", taskPrompt: "task", fixedListEvaluationPrompt: "fixed" },
      discoveryItems: [], fetchImplementation: fetchMock,
    });
    expect(result.selectedCandidates[0].eligibility.networkingRelevant).toBe(false);
    expect(result.selectedCandidates[0].score).toBe(0);
  });
});
