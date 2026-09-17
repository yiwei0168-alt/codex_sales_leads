import { describe, expect, it, vi } from "vitest";

import {
  buildAssistantServerGraph,
  buildLeadServerGraph,
  buildRuntimeHealthGraph,
} from "./server";

describe("standalone LangGraph composed workflows", () => {
  it("reports readiness without external dependencies", async () => {
    const result = await buildRuntimeHealthGraph().invoke({ probe: "acceptance" });

    expect(result).toMatchObject({
      probe: "acceptance",
      status: "ready",
      service: "network-channel-langgraph",
    });
  });

  it("executes the guarded assistant business graph behind an expandable subgraph node", async () => {
    const executeAssistantGraph = vi.fn(async () => ({ reply: "ok", warnings: [] }));
    const graph = buildAssistantServerGraph({ executeAssistantGraph: executeAssistantGraph as never });
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      content: "检查现有知识",
      history: [],
    };

    const result = await graph.invoke(input);

    expect(executeAssistantGraph).toHaveBeenCalledWith(input.userId, input.content, []);
    expect(result.result).toEqual({ reply: "ok", warnings: [] });
    expect([...graph.getSubgraphs()].map(([name]) => name)).toContain("assistant_business_flow");
  });

  it("executes the guarded lead business graph behind an expandable subgraph node", async () => {
    const workflowResult = { status: "completed" };
    const executeLeadGraph = vi.fn(async () => workflowResult);
    const graph = buildLeadServerGraph({ executeLeadGraph: executeLeadGraph as never });
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      actionId: "22222222-2222-4222-8222-222222222222",
      graphThreadId: "lead:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
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

    expect(executeLeadGraph).toHaveBeenCalledWith(input);
    expect(result.result).toBe(workflowResult);
    expect([...graph.getSubgraphs()].map(([name]) => name)).toContain("lead_business_flow");
  });

  it("rejects malformed server inputs before a business graph is called", async () => {
    const executeLeadGraph = vi.fn();
    const graph = buildLeadServerGraph({ executeLeadGraph: executeLeadGraph as never });

    await expect(graph.invoke({
      userId: "not-a-user-id",
      actionId: "not-an-action-id",
      graphThreadId: "not-a-thread-id",
      plan: {},
    } as never)).rejects.toThrow();
    expect(executeLeadGraph).not.toHaveBeenCalled();
  });

  it("publishes every product orchestration node through xray graph expansion", async () => {
    const assistantNodes = Object.keys((await buildAssistantServerGraph({
      executeAssistantGraph: vi.fn() as never,
    }).getGraphAsync({ xray: true })).nodes);
    const leadNodes = Object.keys((await buildLeadServerGraph({
      executeLeadGraph: vi.fn() as never,
    }).getGraphAsync({ xray: true })).nodes);

    expect(assistantNodes).toEqual(expect.arrayContaining([
      "validate_assistant_request",
      "assistant_business_flow:plan_request",
      "assistant_business_flow:respond_budget_change",
      "assistant_business_flow:respond_product_action",
      "assistant_business_flow:respond_lead_plan",
      "assistant_business_flow:respond_general",
      "assistant_business_flow:respond_clarification",
      "assistant_business_flow:retrieve_internal_knowledge",
      "assistant_business_flow:retrieve_hybrid_internal",
      "assistant_business_flow:retrieve_hybrid_external",
      "assistant_business_flow:synthesize_hybrid_answer",
      "publish_assistant_result",
    ]));
    expect(leadNodes).toEqual(expect.arrayContaining([
      "validate_lead_request",
      "lead_business_flow:retrieve_knowledge",
      "lead_business_flow:build_playbook",
      "lead_business_flow:discover_candidates",
      "lead_business_flow:collect_evidence",
      "lead_business_flow:correct_candidates",
      "lead_business_flow:route_candidates",
      "lead_business_flow:score_candidates",
      "lead_business_flow:recover_incomplete_processing",
      "lead_business_flow:review_assessment_anomalies",
      "lead_business_flow:assemble_handoff_briefs",
      "lead_business_flow:persist_results",
      "publish_lead_result",
    ]));
  });
});
