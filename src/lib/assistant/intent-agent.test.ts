import { afterEach, describe, expect, it, vi } from "vitest";

import { planAssistantRequest } from "./intent-agent";

afterEach(() => vi.unstubAllEnvs());

describe("Kimi intent and planning agent", () => {
  it("passes recent turns and returns a validated revised lead plan", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "kimi-k3",
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 40 } },
      choices: [{ message: { content: JSON.stringify({
        intent: "lead_search", confidence: 0.96, internal_question: "", external_questions: [],
        lead_plan: { country: "法国", country_code: "FR", objective: "new_market", roles: ["Reseller"], target_count: 30, query_language: "zh-CN" },
      }) } }],
    }), { status: 200 }));
    const result = await planAssistantRequest("改成法国 30 家 reseller", [
      { role: "user", content: "搜索德国 10 家 SI" },
      { role: "assistant", content: "已生成德国计划" },
    ], fetchMock);
    expect(result.intent).toBe("lead-search");
    expect(result.leadPlan).toMatchObject({ countryCode: "FR", targetCount: 30, roles: ["Reseller"], objective: "new-market" });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("kimi-k2.6");
    expect(request.messages[1].content).toContain("已生成德国计划");
    expect(result.plannerSource).toBe("kimi-light");
    expect(result.plannerCalls).toEqual([expect.objectContaining({ requestedModel: "kimi-k2.6",
      actualModel: "kimi-k3", inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, totalTokens: 120,
      attempts: 1, retries: 0, succeeded: true, usageAvailable: true })]);
  });

  it("turns low-confidence classifications into a follow-up question", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ intent: "general", confidence: 0.2, reply: "你希望我查询资料还是搜索客户？" }) } }],
    }), { status: 200 }));
    const result = await planAssistantRequest("做一下", [], fetchMock);
    expect(result).toMatchObject({ intent: "clarification", reply: "你希望我查询资料还是搜索客户？" });
  });

  it("uses a deterministic safe fallback when Kimi is unavailable", async () => {
    vi.stubEnv("KIMI_API_KEY", "");
    const result = await planAssistantRequest("WR3000 支持哪些无线协议？");
    expect(result).toMatchObject({ intent: "knowledge-question", plannerSource: "deterministic-fallback" });
  });

  it("preserves failed-call telemetry when Kimi falls back", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "kimi-k2.6", error: { message: "diagnostic failure" },
    }), { status: 400 }));
    const result = await planAssistantRequest("Find 2 distributors in Canada", [], fetchMock);
    expect(result).toMatchObject({ plannerSource: "deterministic-fallback",
      plannerCalls: [expect.objectContaining({ requestedModel: "kimi-k2.6", actualModel: "kimi-k2.6",
        succeeded: false, usageAvailable: false, attempts: 1, retries: 0,
        failureReason: "diagnostic failure" })] });
    expect(result.warnings.join(" ")).toContain("diagnostic failure");
  });

  it("uses K3 only when the light Kimi model identifies a materially complex planning task", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const response = (value: Record<string, unknown>, model: string) => new Response(JSON.stringify({ model,
      choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ intent: "lead_search", confidence: 0.9, requires_k3_planning: true,
        planning_reason: "Multiple markets and conflicting constraints.", lead_plan: { country: "Germany",
          country_code: "DE", roles: ["Distributor"] } }, "kimi-k2.6"))
      .mockResolvedValueOnce(response({ intent: "lead_search", confidence: 0.95, requires_k3_planning: false,
        lead_plan: { country: "France", country_code: "FR", roles: ["SI", "VAR"], target_count: 40,
          objective: "new-market", query_language: "en" } }, "kimi-k3"));
    const result = await planAssistantRequest("比较德国和法国后按约束制定法国计划", [], fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe("kimi-k2.6");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe("kimi-k3");
    expect(result).toMatchObject({ plannerSource: "kimi-k3", leadPlan: { countryCode: "FR", targetCount: 40 } });
  });

  it("removes special roles hallucinated by Kimi unless the user explicitly requests them", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ intent: "lead_search", confidence: 0.95,
        lead_plan: { country: "Germany", country_code: "DE", roles: ["Distributor", "Agent", "Brand Owner"],
          opportunity_targets: ["OEM/ODM"] } }) } }],
    }), { status: 200 }));
    const result = await planAssistantRequest("Search Germany distributors", [], fetchMock);
    expect(result.leadPlan?.roles).toEqual(["Distributor"]);
    expect(result.leadPlan?.opportunityTargets).toEqual([]);
  });
});
