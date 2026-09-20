import { z } from "zod";
import { availableTools, describeTool, productTools } from "./tools";
import { digest, result, type ExecutionContext, type ModelToolCall, type ProductTool, type ToolResult } from "./contracts";
import { beginCall, completeCall, event, boundary, LeaseLostError } from "./repository";

const invocation = z.object({ tool: z.string().max(120), arguments: z.record(z.string(), z.unknown()) }).strict();
export async function dispatchTool(call: ModelToolCall, context: ExecutionContext, tools = productTools): Promise<ToolResult> {
  let parsed: unknown;
  try { parsed = JSON.parse(call.function.arguments); } catch { return result(null, { status: "missing_input", missing: ["Valid JSON arguments required"] }); }
  const allowed = availableTools(context, tools);
  if (call.function.name === "discover_tools") return result(allowed.map(t => ({ id: t.id, description: t.description, effect: t.effect, cost: t.cost })), { cost: "known" });
  if (call.function.name === "describe_tool") {
    const p = z.object({ tool: z.string() }).strict().safeParse(parsed);
    const tool = p.success ? allowed.find(t => t.id === p.data.tool) : undefined;
    return tool ? result(describeTool(tool), { cost: "known" }) : result(null, { status: "unavailable", missing: ["Registered accessible tool"] });
  }
  const p = invocation.safeParse(parsed);
  if (call.function.name !== "execute_tool" || !p.success) return result(null, { status: "missing_input", missing: ["execute_tool requires tool and arguments; server identity cannot be supplied"] });
  const tool = allowed.find(t => t.id === p.data.tool);
  if (!tool) return result(null, { status: "unavailable", missing: ["Registered accessible tool"] });
  const input = tool.input.safeParse(p.data.arguments);
  if (!input.success) return result(null, { status: "missing_input", missing: input.error.issues.map(e => `${e.path.join(".")}: ${e.message}`) });
  return executeRegisteredTool(tool, input.data, call.id, context);
}
export async function executeRegisteredTool(tool: ProductTool, input: unknown, callKey: string, context: ExecutionContext): Promise<ToolResult> {
  const current = await boundary(context);
  if (current.control) throw new LeaseLostError();
  if (tool.role === "admin" && context.role !== "admin") return result(null, { status: "unavailable", missing: ["Administrator permission"] });
  // No write tool can bypass this hook. Exact approval storage is added in P3.
  if (tool.effect !== "read") return result(null, { status: "waiting_approval", missing: ["Exact action approval", digest({ tool: tool.id, version: tool.version, input })] });
  const saved = await beginCall(context, { key: callKey, tool: tool.id, version: tool.version, input, effect: tool.effect });
  if (saved.output) return tool.output.parse(saved.output);
  // A started call may have reached a provider before process loss. Never silently replay it.
  if (!saved.fresh) return result({ callId: saved.id }, { status: "unknown", missing: ["Previous execution has no saved receipt; reconcile before repeating"] });
  const started = Date.now();
  await event(context, "tool_started", { tool: tool.id, callId: saved.id });
  let output: ToolResult;
  try { output = tool.output.parse(await tool.execute(input, context)); }
  catch (error) {
    if (error instanceof LeaseLostError) throw error;
    // Provider error bodies can contain private input or credentials. Persist a safe code only.
    output = result(null, { status: "unavailable", missing: ["Tool failed; saved prior results remain available"], cost: tool.cost });
  }
  const valid = output.status === "success" || output.status === "partial";
  await completeCall(context, saved.id, output, {
    inputItems: 1, validOutputItems: valid ? 1 : 0, downstreamUsedItems: null,
    inputTokens: null, outputTokens: null, apiCredits: tool.cost === "known" && tool.connections.length === 0 ? 0 : null,
    costUsd: tool.cost === "known" && tool.connections.length === 0 ? 0 : null, costState: output.cost,
    latencyMs: Date.now() - started, retries: 0, discardedReasonCounts: valid ? {} : { [output.status]: 1 },
    utilizationEfficiency: null, usageBoundary: "persisted-tool-output-not-yet-consumed", optimizationOpportunity: "Reuse stored evidence and call outputs before invoking providers again",
  });
  await event(context, "tool_result", { tool: tool.id, callId: saved.id, status: output.status, sources: output.sources, artifacts: output.artifacts });
  return output;
}
