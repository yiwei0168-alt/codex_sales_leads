import { describe, expect, it, vi } from "vitest";

import { buildAssistantWorkflowGraph } from "./graph";

describe("assistant workflow graph", () => {
  it("routes a lead request to a confirmation plan without calling knowledge answer generation", async () => {
    const answerKnowledge = vi.fn();
    const graph = buildAssistantWorkflowGraph({ answerKnowledge, missingRagConfig: () => [] });
    const state = await graph.invoke({ userId: "user", content: "搜索德国 10 家系统集成商", intent: "general", reply: "" });
    expect(state.intent).toBe("lead-search");
    expect(state.plan?.countryCode).toBe("DE");
    expect(state.reply).toContain("三路融合");
    expect(answerKnowledge).not.toHaveBeenCalled();
  });

  it("routes knowledge questions through the grounded RAG dependency", async () => {
    const answerKnowledge = vi.fn().mockResolvedValue({
      answer: "grounded", citations: [], grounded: true, model: "test", latencyMs: 1, warnings: [],
    });
    const graph = buildAssistantWorkflowGraph({ answerKnowledge, missingRagConfig: () => [] });
    const state = await graph.invoke({ userId: "user", content: "WR3000 支持哪些协议？", intent: "general", reply: "" });
    expect(state.intent).toBe("knowledge-question");
    expect(state.reply).toBe("grounded");
    expect(answerKnowledge).toHaveBeenCalledOnce();
  });
});
