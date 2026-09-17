import { describe, expect, it, vi } from "vitest";

import { createProductLangGraphInvoker } from "./client";
import { WorkflowPausedError } from "@/lib/leads/workflow/pause";

describe("product LangGraph API client", () => {
  it("routes assistant work through the standalone assistant graph", async () => {
    const wait = vi.fn(async (threadId: null, assistantId: string, payload: {
      input: Record<string, unknown>; signal?: AbortSignal;
    }) => {
      void [threadId, assistantId, payload];
      return { result: { intent: "general", reply: "ok", warnings: [] } };
    });
    const invoker = createProductLangGraphInvoker({ runs: { wait }, assistantTimeoutMs: 1_000 });

    const result = await invoker.invokeAssistant(
      "11111111-1111-4111-8111-111111111111",
      "hello",
      [{ role: "user", content: "history" }],
    );

    expect(result.reply).toBe("ok");
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls[0][0]).toBeNull();
    expect(wait.mock.calls[0][1]).toBe("assistant_workflow");
    expect(wait.mock.calls[0][2]).toMatchObject({ input: {
      userId: "11111111-1111-4111-8111-111111111111",
      content: "hello",
      history: [{ role: "user", content: "history" }],
    } });
  });

  it("routes lead work through the standalone lead graph", async () => {
    const workflowResult = { runId: "run", graphThreadId: "lead:action:thread" };
    const wait = vi.fn(async (threadId: null, assistantId: string, payload: {
      input: Record<string, unknown>; signal?: AbortSignal;
    }) => {
      void [threadId, assistantId, payload];
      return { result: workflowResult };
    });
    const invoker = createProductLangGraphInvoker({ runs: { wait }, leadTimeoutMs: 1_000 });
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      actionId: "22222222-2222-4222-8222-222222222222",
      graphThreadId: "lead:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
      plan: {
        countryCode: "DE", countryName: "Germany", objective: "new-market" as const,
        roles: ["Distributor" as const], targetCount: 1, queryLanguage: "en", userRequest: "find one",
      },
    };

    expect(await invoker.invokeLead(input)).toBe(workflowResult);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls[0][1]).toBe("lead_workflow");
    expect(wait.mock.calls[0][2]).toMatchObject({ input });
  });

  it("routes knowledge work through the standalone knowledge graph", async () => {
    const workflowResult = { kind: "fact-answer", reasonCode: "ok", answer: "8" };
    const wait = vi.fn(async (threadId: null, assistantId: string, payload: {
      input: Record<string, unknown>; signal?: AbortSignal;
    }) => {
      void [threadId, assistantId, payload];
      return { result: workflowResult };
    });
    const invoker = createProductLangGraphInvoker({ runs: { wait }, knowledgeTimeoutMs: 1_000 });
    const result = await invoker.invokeKnowledge({
      userId: "11111111-1111-4111-8111-111111111111",
      question: "How many Ethernet ports?",
      collections: ["product"],
      entry: "knowledge-page",
    });
    expect(result).toBe(workflowResult);
    expect(wait.mock.calls[0][1]).toBe("knowledge_workflow");
    expect(wait.mock.calls[0][2]).toMatchObject({ input: { history: [], collections: ["product"] } });
  });

  it("fails closed without retrying or falling back when the service is unavailable", async () => {
    const wait = vi.fn(async (threadId: null, assistantId: string, payload: {
      input: Record<string, unknown>; signal?: AbortSignal;
    }) => {
      void [threadId, assistantId, payload];
      throw new Error("connect ECONNREFUSED");
    });
    const invoker = createProductLangGraphInvoker({ runs: { wait }, assistantTimeoutMs: 1_000 });

    await expect(invoker.invokeAssistant(
      "11111111-1111-4111-8111-111111111111",
      "hello",
    )).rejects.toThrow("独立 LangGraph 服务调用失败（assistant_workflow）：connect ECONNREFUSED");
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("rejects a protocol response without a result", async () => {
    const wait = vi.fn(async (threadId: null, assistantId: string, payload: {
      input: Record<string, unknown>; signal?: AbortSignal;
    }) => {
      void [threadId, assistantId, payload];
      return { status: "completed" };
    });
    const invoker = createProductLangGraphInvoker({ runs: { wait }, leadTimeoutMs: 1_000 });

    await expect(invoker.invokeLead({
      userId: "11111111-1111-4111-8111-111111111111",
      actionId: "22222222-2222-4222-8222-222222222222",
      graphThreadId: "lead:thread",
      plan: {
        countryCode: "DE", countryName: "Germany", objective: "new-market",
        roles: ["Distributor"], targetCount: 1, queryLanguage: "en", userRequest: "find one",
      },
    })).rejects.toThrow("returned no result");
  });

  it("restores the workflow pause domain error returned by the service", async () => {
    const wait = vi.fn(async (threadId: null, assistantId: string, payload: {
      input: Record<string, unknown>; signal?: AbortSignal;
    }) => {
      void [threadId, assistantId, payload];
      throw new Error('Error: {"error":"WorkflowPausedError","message":"paused"}');
    });
    const invoker = createProductLangGraphInvoker({ runs: { wait }, leadTimeoutMs: 1_000 });

    const promise = invoker.invokeLead({
      userId: "11111111-1111-4111-8111-111111111111",
      actionId: "22222222-2222-4222-8222-222222222222",
      graphThreadId: "lead:thread",
      plan: {
        countryCode: "DE", countryName: "Germany", objective: "new-market",
        roles: ["Distributor"], targetCount: 1, queryLanguage: "en", userRequest: "find one",
      },
    });

    await expect(promise).rejects.toBeInstanceOf(WorkflowPausedError);
  });
});
