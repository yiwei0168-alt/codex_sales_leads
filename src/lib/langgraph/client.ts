import { Client } from "@langchain/langgraph-sdk";

import type { AssistantConversationTurn, LeadSearchPlan } from "@/lib/assistant/types";
import type { runAssistantWorkflow } from "@/lib/assistant/graph";
import type { LeadWorkflowResult } from "@/lib/leads/workflow/types";
import { WorkflowPausedError } from "@/lib/leads/workflow/pause";

export type AssistantWorkflowResult = Awaited<ReturnType<typeof runAssistantWorkflow>>;

export interface LeadWorkflowInvocation {
  userId: string;
  actionId: string;
  graphThreadId: string;
  plan: LeadSearchPlan;
}

interface RunsWaitClient {
  wait(
    threadId: null,
    assistantId: string,
    payload: { input: Record<string, unknown>; signal?: AbortSignal },
  ): Promise<unknown>;
}

export interface ProductLangGraphInvoker {
  invokeAssistant(
    userId: string,
    content: string,
    history?: AssistantConversationTurn[],
  ): Promise<AssistantWorkflowResult>;
  invokeLead(input: LeadWorkflowInvocation): Promise<LeadWorkflowResult>;
}

function configuredDuration(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(Math.trunc(value), maximum));
}

function configuredApiUrl(): string {
  const value = process.env.LANGGRAPH_API_URL?.trim() || "http://127.0.0.1:2024";
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LANGGRAPH_API_URL must use http or https");
  }
  return url.href.replace(/\/$/, "");
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function invoke<TResult>(
  runs: RunsWaitClient,
  graphId: string,
  input: Record<string, unknown>,
  timeoutMs: number,
): Promise<TResult> {
  try {
    const state = await runs.wait(null, graphId, {
      input,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!state || typeof state !== "object" || !("result" in state) || state.result == null) {
      throw new Error(`LangGraph ${graphId} returned no result`);
    }
    return state.result as TResult;
  } catch (error) {
    const message = messageFrom(error);
    if (graphId === "lead_workflow" && message.includes('"error":"WorkflowPausedError"')) {
      throw new WorkflowPausedError();
    }
    throw new Error(`独立 LangGraph 服务调用失败（${graphId}）：${message}`, { cause: error });
  }
}

export function createProductLangGraphInvoker(options: {
  runs: RunsWaitClient;
  assistantTimeoutMs?: number;
  leadTimeoutMs?: number;
}): ProductLangGraphInvoker {
  const assistantTimeoutMs = options.assistantTimeoutMs ?? 300_000;
  const leadTimeoutMs = options.leadTimeoutMs ?? 7_200_000;
  return {
    invokeAssistant: (userId, content, history = []) => invoke<AssistantWorkflowResult>(
      options.runs,
      "assistant_workflow",
      { userId, content, history },
      assistantTimeoutMs,
    ),
    invokeLead: (input) => invoke<LeadWorkflowResult>(
      options.runs,
      "lead_workflow",
      input as unknown as Record<string, unknown>,
      leadTimeoutMs,
    ),
  };
}

let productionInvoker: ProductLangGraphInvoker | undefined;

function getProductionInvoker(): ProductLangGraphInvoker {
  if (!productionInvoker) {
    const client = new Client({
      apiUrl: configuredApiUrl(),
      // Do not accidentally forward a LangSmith key to the local runtime.
      apiKey: null,
      // A retried POST could purchase the same assistant work twice. Recovery
      // belongs to the inner guarded workflow and its persisted checkpoint.
      callerOptions: { maxRetries: 0 },
    });
    productionInvoker = createProductLangGraphInvoker({
      runs: client.runs,
      assistantTimeoutMs: configuredDuration("LANGGRAPH_ASSISTANT_TIMEOUT_MS", 300_000, 30_000, 600_000),
      leadTimeoutMs: configuredDuration("LANGGRAPH_LEAD_TIMEOUT_MS", 7_200_000, 60_000, 14_400_000),
    });
  }
  return productionInvoker;
}

export function invokeAssistantWorkflowViaLangGraph(
  userId: string,
  content: string,
  history: AssistantConversationTurn[] = [],
): Promise<AssistantWorkflowResult> {
  return getProductionInvoker().invokeAssistant(userId, content, history);
}

export function invokeLeadWorkflowViaLangGraph(input: LeadWorkflowInvocation): Promise<LeadWorkflowResult> {
  return getProductionInvoker().invokeLead(input);
}
