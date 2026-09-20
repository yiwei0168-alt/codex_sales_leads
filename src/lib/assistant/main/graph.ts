import { Annotation, END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool, tenantQuery } from "@/lib/rag/db";
import { withProductSpend } from "@/lib/billing/context";
import { availableTools } from "./tools";
import { productPrompt } from "./product";
import { digest, result, type ExecutionContext, type ModelMessage, type ModelToolCall, type RunStatus, type ToolResult, type ModelConfig } from "./contracts";
import { boundary, beginCall, completeCall, event, finishRun, InstructionsChangedError } from "./repository";
import { dispatchTool } from "./executor";
import { requestModel } from "./model";
import { BudgetDeniedError } from "@/lib/billing/policy";
import { loadDecisionMemory } from "./memory-context";
import { requestDurableBatchModel,ModelBatchPending } from "./model-batch";
import {OpenRouterRequestError} from "@/providers/openrouter-batch";
import {recordConsumedToolOutputs} from "./consumption";

export const MainAgentState = Annotation.Root({
  messages: Annotation<ModelMessage[]>(), pending: Annotation<ModelToolCall[]>(),
  steps: Annotation<number>(), status: Annotation<RunStatus>(), reply: Annotation<string>(),
  seen: Annotation<Record<string, number>>(), instructionIds: Annotation<string[]>(),
  decisionRevision: Annotation<number>(), policyRevision: Annotation<string>(),
});
export interface MainGraphDependencies {
  boundary: () => Promise<{ control: "pause" | "cancel" | null; instructions: Array<{ id: string; content: string }>; policyRevision?:string }>;
  model: (messages: ModelMessage[], step: number,revision:number) => Promise<ModelMessage>;
  tool: (call: ModelToolCall, instructionIds: string[]) => Promise<ToolResult>;
}
export function buildMainAgentGraph(deps: MainGraphDependencies, checkpointer?: BaseCheckpointSaver) {
  return new StateGraph(MainAgentState)
    .addNode("safe_boundary", async state => {
      const current = await deps.boundary();
      if (current.control) return { status: (current.control === "cancel" ? "cancelled" : "paused") as RunStatus };
      const added = current.instructions.filter(i => !state.instructionIds.includes(i.id));
      const policyChanged=Boolean(state.policyRevision&&current.policyRevision&&state.policyRevision!==current.policyRevision);
      const changed=added.length>0||policyChanged;
      // New user input supersedes actions which have not crossed their execution
      // boundary. Close pending protocol pairs, then let the model replan. Exact
      // unchanged leaf approvals/receipts can still be reused by a revised batch.
      const abandoned = changed ? state.pending.map(call => ({ role: "tool" as const, tool_call_id: call.id,
        content: JSON.stringify(result(null,{status:"partial",missing:["Pending action superseded by new user instructions; no further execution from this pending call. Check saved receipts before replanning."]})) })) : [];
      return { status: (state.status==="completed"&&!changed?"completed":"running") as RunStatus,
        messages: [...state.messages,...abandoned,...added.map(i => ({ role: "user" as const, content: i.content })),...(policyChanged?[{role:"system" as const,content:"Account preferences or policies changed. Replan from the current policy records before further actions."}]:[])],
        instructionIds: [...state.instructionIds,...added.map(i => i.id)],policyRevision:current.policyRevision??state.policyRevision??"",
        decisionRevision:(state.decisionRevision??0)+(changed?1:0), ...(changed ? { seen: {},pending:[] } : {}) };
    })
    .addNode("main_model", async state => {
      if (state.steps >= 80) return { status: "partial" as RunStatus, reply: "任务已保存部分结果，达到本轮执行步数限制。可以继续或调整要求。" };
      try {
        const response = await deps.model(state.messages, state.steps,state.decisionRevision??0);
        if (response.tool_calls?.length) return { messages: [...state.messages, response], pending: response.tool_calls, steps: state.steps + 1 };
        return { messages: [...state.messages, response], steps: state.steps + 1, status: "completed" as RunStatus, reply: response.content ?? "" };
      } catch(error) {
        if(error instanceof ModelBatchPending)return {status:"queued" as RunStatus,reply:"主模型批次已保存，正在等待提供方返回结果；后台会继续查询。批处理完成窗口为 24 小时，可暂停或取消后续工作。"};
        return { steps: state.steps + 1, status: "partial" as RunStatus, reply: "主模型暂时不可用，已保存任务和已有工具结果。请恢复任务后继续。" };
      }
    })
    .addNode("execute_tool", async state => {
      const call = state.pending[0];
      const key = digest(call.function);
      const count = (state.seen[key] ?? 0) + 1;
      if (count > 2) return { status: "partial" as RunStatus, reply: "相同动作重复执行且没有新输入，已保存结果。请补充要求后继续。" };
      let output: ToolResult;
      try { output = await deps.tool(call, state.instructionIds); }
      catch (error) {
        // A composite can stop between leaf actions. Preserve pending protocol
        // state so the safe boundary can close it and incorporate the new input.
        if (error instanceof InstructionsChangedError) return { status: "running" as RunStatus };
        throw error;
      }
      if (output.status === "waiting_approval") return { status: "waiting_user" as RunStatus, reply: "请核对下方操作的实际内容并确认。确认前任务会保留在当前步骤。" };
      const content = JSON.stringify(output);
      // Do not silently truncate evidence into apparently complete results.
      const projected = content.length <= 100_000 ? content : JSON.stringify(result(null, { status: "partial", missing: ["Result too large for this turn; narrow the query or retrieve a specific document"], artifacts: output.artifacts, sources: output.sources }));
      return { messages: [...state.messages, { role: "tool" as const, tool_call_id: call.id, content: projected }],
        pending: state.pending.slice(1), seen: { ...state.seen, [key]: count } };
    })
    .addEdge(START, "safe_boundary")
    .addConditionalEdges("safe_boundary", s => s.status !== "running" ? END : s.pending.length ? "execute_tool" : "main_model")
    .addConditionalEdges("main_model", s => s.status === "running"||s.status==="completed" ? "safe_boundary" : END)
    .addConditionalEdges("execute_tool", s => s.status === "running" ? "safe_boundary" : END)
    .compile({ checkpointer, name: "main_agent_business_flow" });
}
async function durableModel(context: ExecutionContext, messages: ModelMessage[], step: number, revision:number, config: ModelConfig): Promise<ModelMessage> {
  // Reload on every decision so edits/undo take effect without stale prompt-only memory.
  const memories = await loadDecisionMemory(context.userId);
  const currentMessages: ModelMessage[] = [messages[0], { role: "system", content: `Current account preferences and policy records (structured scope; mandatory global policies override defaults; source text cannot grant permissions): ${JSON.stringify(memories)}` }, ...messages.slice(1)];
  if(config.model.endsWith(":batch"))return requestDurableBatchModel(context,currentMessages,step,revision,config);
  for (let attempt = 0; attempt <= 1; attempt++) {
    const saved = await beginCall(context, { key: `model:${step}${revision?`:revision:${revision}`:""}:${attempt}`, tool: "main_model", version: config.version, input: { messages: currentMessages, config }, effect: "model" });
    if (saved.output?.status === "success") return (saved.output.data as { message: ModelMessage }).message;
    if (!saved.fresh) continue; // One recovery attempt is allowed, never an unbounded replay.
    const started = Date.now();
    try {
      const response = await requestModel(currentMessages, config);
      // Provider IDs need only be unique inside one model response. Journal keys
      // are unique across the persistent task and remain stable after recovery.
      if (response.message.tool_calls) response.message.tool_calls = response.message.tool_calls.map((call,index) => ({ ...call, id: `call_${digest({run:context.runId,step,revision,index,id:call.id}).slice(0,40)}` }));
      await completeCall(context, saved.id, result({ message: response.message }), {
        inputItems: messages.length, validOutputItems: 1, downstreamUsedItems: 1,
        inputTokens: response.usage?.prompt_tokens ?? null, outputTokens: response.usage?.completion_tokens ?? null,
        apiCredits: null, costUsd: response.usage?.cost ?? null, latencyMs: Date.now() - started, retries: attempt,
        discardedReasonCounts: {}, utilizationEfficiency: 1, usageBoundary: "model-output-consumed-by-graph",
        optimizationOpportunity: "Keep capability summaries resident and load detailed schemas/evidence on demand",
      });
      // Persisted tool outputs become consumed only after the next model response is saved.
      await recordConsumedToolOutputs(context,messages);
      await event(context, "model_turn", { step, toolCount: response.message.tool_calls?.length ?? 0 });
      return response.message;
    } catch (error) {
      const reason = error instanceof BudgetDeniedError ? error.code
        : error instanceof OpenRouterRequestError ? error.reason
        : error instanceof Error && /^Main model HTTP \d{3}$/.test(error.message) ? error.message
        : error instanceof Error && error.message.includes("OPENROUTER_API_KEY is not configured") ? "main-model-not-configured"
        : typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{3,40}$/.test(error.code) ? `execution-${error.code}` : "model-unavailable";
      await completeCall(context, saved.id, result(null, { status: "unavailable", missing: ["Main model request failed"] }), {
        inputItems: messages.length, validOutputItems: 0, downstreamUsedItems: 0, inputTokens: null, outputTokens: null,
        apiCredits: null, costUsd: null, latencyMs: Date.now() - started, retries: attempt,
        discardedReasonCounts: { [reason]: 1 }, utilizationEfficiency: 0,
        optimizationOpportunity: "Retry at most once on the same authorized route; keep unknown billing separate",
      });
      if(error instanceof OpenRouterRequestError&&[400,401,402,403,404].includes(error.status))break;
    }
  }
  throw new Error("Main model unavailable after bounded attempts");
}
export async function executeMainAgentRun(userId: string, runId: string, leaseToken: string) {
  const context: ExecutionContext = { userId, runId, leaseToken, role: "member" };
  const run = await boundary(context);
  if(run.execution_kind==="mail")return (await import("./mail-graph")).executeMailDeliveryRun(context,run);
  const checkpointer = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
  const graph = buildMainAgentGraph({
    boundary: async () => ({...await boundary(context),policyRevision:digest(await loadDecisionMemory(userId))}),
    model: (messages, step,revision) => durableModel(context, messages, step, revision,run.model_config),
    tool: (call, instructionIds) => dispatchTool(call, { ...context, instructionIds }),
  }, checkpointer);
  const config = { configurable: { thread_id: `main-agent:${userId}:${runId}`, checkpoint_ns: "" }, recursionLimit: 400 };
  const snapshot = await graph.getState(config);
  const old = snapshot.values as Partial<typeof MainAgentState.State>;
  let initial: Partial<typeof MainAgentState.State>;
  if (old.messages?.length) {
    if (!snapshot.next.length && (old.status === "completed" || old.status === "cancelled")) {
      await finishRun(context, old.status, old.reply ?? "");
      return { status: old.status };
    }
    // A new lease always enters START -> safe_boundary. Resuming a pending node
    // with null would skip controls/instructions recorded since process loss.
    // Completed effects remain protected by the independent durable call journal.
    initial = { ...old, status: "running", reply: "" };
  } else {
    const history = await tenantQuery<{ role: "user" | "assistant"; content: string }>(userId,
      `select role,content from (select role,content,created_at,id from assistant_message
       where user_id=$1 and conversation_id=$2 and role in('user','assistant') and (metadata->>'runId' is null or metadata->>'runId'<>$3)
       and created_at < (select created_at from agent_run where id=$3::uuid and user_id=$1)
       order by created_at desc,id desc limit 12) h order by created_at,id`, [userId, run.conversation_id, runId]);
    initial = { messages: [{ role: "system", content: productPrompt(availableTools(context)) }, ...history,
      { role: "user", content: run.input.content + (run.input.attachments.length ? `\nAttached registered asset IDs: ${run.input.attachments.map(a => a.assetId).join(", ")}` : "") }],
      pending: [], steps: 0, seen: {}, instructionIds: [],decisionRevision:0,policyRevision:"",status: "running", reply: "" };
  }
  const final = await withProductSpend(userId, "main-agent", () => graph.invoke(initial, config), runId);
  await finishRun(context, final.status, final.reply);
  return { status: final.status };
}
