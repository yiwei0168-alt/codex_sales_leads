import { afterEach, describe, expect, it, vi } from "vitest";

import { planAssistantRequest } from "./intent-agent";

afterEach(() => vi.unstubAllEnvs());

describe("Kimi intent and planning agent", () => {
  it("passes recent turns and returns a validated revised lead plan", async () => {
    vi.stubEnv("KIMI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "kimi-k3",
      choices: [{ message: { content: JSON.stringify({
        intent: "lead_search", confidence: 0.96, internal_question: "", external_questions: [],
        lead_plan: { country: "法国", country_code: "FR", objective: "new-market", roles: ["Reseller"], target_count: 30, query_language: "zh-CN" },
      }) } }],
    }), { status: 200 }));
    const result = await planAssistantRequest("改成法国 30 家 reseller", [
      { role: "user", content: "搜索德国 10 家 SI" },
      { role: "assistant", content: "已生成德国计划" },
    ], fetchMock);
    expect(result.intent).toBe("lead-search");
    expect(result.leadPlan).toMatchObject({ countryCode: "FR", targetCount: 30, roles: ["Reseller"] });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[1].content).toContain("已生成德国计划");
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
});
