import { describe, expect, it, vi } from "vitest";

import {
  buildAssistantServerGraph,
  buildLeadServerGraph,
  buildRuntimeHealthGraph,
} from "./server";

describe("standalone LangGraph server adapters", () => {
  it("reports readiness without external dependencies", async () => {
    const result = await buildRuntimeHealthGraph().invoke({ probe: "acceptance" });

    expect(result).toMatchObject({
      probe: "acceptance",
      status: "ready",
      service: "network-channel-langgraph",
    });
  });

  it("delegates assistant execution to the existing guarded runner", async () => {
    const runAssistant = vi.fn(async () => ({ reply: "ok", warnings: [] }));
    const graph = buildAssistantServerGraph({ runAssistant: runAssistant as never });
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      content: "检查现有知识",
      history: [],
    };

    const result = await graph.invoke(input);

    expect(runAssistant).toHaveBeenCalledWith(input.userId, input.content, []);
    expect(result.result).toEqual({ reply: "ok", warnings: [] });
  });

  it("delegates lead execution without replacing tenant, budget, or checkpoint logic", async () => {
    const workflowResult = { status: "completed" };
    const runLead = vi.fn(async () => workflowResult);
    const graph = buildLeadServerGraph({ runLead: runLead as never });
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      actionId: "22222222-2222-4222-8222-222222222222",
      graphThreadId: "33333333-3333-4333-8333-333333333333",
      plan: {
        countryCode: "DE",
        countryName: "Germany",
        objective: "new-market" as const,
        roles: ["Distributor" as const],
        targetCount: 1,
        queryLanguage: "en",
        userRequest: "Find one distributor",
      },
    };

    const result = await graph.invoke(input);

    expect(runLead).toHaveBeenCalledWith(input);
    expect(result.result).toBe(workflowResult);
  });

  it("rejects malformed server inputs before a guarded runner is called", async () => {
    const runLead = vi.fn();
    const graph = buildLeadServerGraph({ runLead: runLead as never });

    await expect(graph.invoke({
      userId: "not-a-user-id",
      actionId: "not-an-action-id",
      graphThreadId: "not-a-thread-id",
      plan: {},
    } as never)).rejects.toThrow();
    expect(runLead).not.toHaveBeenCalled();
  });
});
