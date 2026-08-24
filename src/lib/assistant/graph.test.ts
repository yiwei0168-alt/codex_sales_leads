import { describe, expect, it, vi } from "vitest";

import { buildAssistantWorkflowGraph, type AssistantGraphDependencies } from "./graph";
import type { IntentPlan } from "./types";

function plan(overrides: Partial<IntentPlan>): IntentPlan {
  return {
    intent: "general", confidence: 0.9, externalQuestions: [], plannerModel: "kimi-k3",
    plannerSource: "kimi-k3", warnings: [], ...overrides,
  };
}

function dependencies(intentPlan: IntentPlan): AssistantGraphDependencies {
  return {
    planRequest: vi.fn().mockResolvedValue(intentPlan),
    answerKnowledge: vi.fn(),
    searchExternal: vi.fn(),
    synthesizeHybrid: vi.fn(),
    missingRagConfig: () => [],
  };
}

describe("assistant workflow graph", () => {
  it("routes a Kimi lead plan to confirmation without retrieval", async () => {
    const deps = dependencies(plan({
      intent: "lead-search",
      leadPlan: { countryCode: "DE", countryName: "德国", objective: "new-market", roles: ["SI"], targetCount: 10, queryLanguage: "zh-CN", userRequest: "搜索德国 10 家系统集成商" },
    }));
    const graph = buildAssistantWorkflowGraph(deps);
    const state = await graph.invoke({ userId: "user", content: "搜索德国 10 家系统集成商", history: [], intent: "general", reply: "", warnings: [] });
    expect(state.intent).toBe("lead-search");
    expect(state.plan?.countryCode).toBe("DE");
    expect(state.reply).toContain("三路融合");
    expect(deps.answerKnowledge).not.toHaveBeenCalled();
  });

  it("routes internal questions through grounded RAG", async () => {
    const deps = dependencies(plan({ intent: "knowledge-question", internalQuestion: "WR3000 protocols" }));
    vi.mocked(deps.answerKnowledge).mockResolvedValue({
      answer: "grounded", citations: [], grounded: true, model: "test", latencyMs: 1, warnings: [],
    });
    const state = await buildAssistantWorkflowGraph(deps).invoke({
      userId: "user", content: "WR3000 支持哪些协议？", history: [], intent: "general", reply: "", warnings: [],
    });
    expect(state.intent).toBe("knowledge-question");
    expect(state.reply).toBe("grounded");
    expect(deps.answerKnowledge).toHaveBeenCalledWith("user", { question: "WR3000 protocols", maxChunks: 8 });
  });

  it("runs internal RAG and Gemini before OpenAI synthesis for hybrid research", async () => {
    const deps = dependencies(plan({ intent: "hybrid-research", internalQuestion: "Cudy Wi-Fi 7 portfolio", externalQuestions: ["current Wi-Fi 7 market"] }));
    vi.mocked(deps.answerKnowledge).mockResolvedValue({ answer: "internal", citations: [], grounded: false, model: "openai", latencyMs: 1, warnings: [] });
    vi.mocked(deps.searchExternal).mockResolvedValue({ answer: "external", citations: [{ url: "https://example.com/", title: "Example" }], searchQueries: ["wifi 7 market"], model: "gemini", latencyMs: 1 });
    vi.mocked(deps.synthesizeHybrid).mockResolvedValue("integrated");
    const state = await buildAssistantWorkflowGraph(deps).invoke({
      userId: "user", content: "结合产品和市场回答", history: [{ role: "user", content: "先看 Wi-Fi 7" }], intent: "general", reply: "", warnings: [],
    });
    expect(state.reply).toBe("integrated");
    expect(deps.searchExternal).toHaveBeenCalledWith(["current Wi-Fi 7 market"]);
    expect(deps.synthesizeHybrid).toHaveBeenCalledOnce();
    expect(deps.planRequest).toHaveBeenCalledWith("结合产品和市场回答", [{ role: "user", content: "先看 Wi-Fi 7" }]);
  });

  it("returns a clarification question without retrieval", async () => {
    const deps = dependencies(plan({ intent: "clarification", confidence: 0.3, reply: "请问你想查哪个国家？" }));
    const state = await buildAssistantWorkflowGraph(deps).invoke({ userId: "user", content: "帮我找一些", history: [], intent: "general", reply: "", warnings: [] });
    expect(state.reply).toBe("请问你想查哪个国家？");
    expect(deps.answerKnowledge).not.toHaveBeenCalled();
    expect(deps.searchExternal).not.toHaveBeenCalled();
  });
});
