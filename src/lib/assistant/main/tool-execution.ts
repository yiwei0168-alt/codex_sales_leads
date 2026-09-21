import { result, type ExecutionContext, type ProductTool, type ToolResult } from "./contracts";
import { beginCall, completeCall, event, boundary, LeaseLostError, InstructionsChangedError, assertCurrentInstructions } from "./repository";
import { needsApproval, requestApproval } from "./approvals";
export async function executeRegisteredTool(tool: ProductTool, input: unknown, callKey: string, context: ExecutionContext): Promise<ToolResult> {
  const current = await boundary(context);
  if (current.control) throw new LeaseLostError();
  assertCurrentInstructions(context, current.instructions);
  if (tool.role === "admin" && context.role !== "admin") return result(null, { status: "unavailable", missing: ["Administrator permission"] });
  let approvalId: string | undefined;
  if (needsApproval(tool)) {
    const approval = await requestApproval(context, tool, input);
    if (["denied", "revoked", "expired"].includes(approval.status)) return result(null, { status: "unavailable", missing: [`Action approval ${approval.status}; do not resubmit unchanged work`] });
    if (approval.status === "pending") return result({ approvalId: approval.id }, { status: "waiting_approval", missing: ["User review of exact parameters required"] });
    approvalId = approval.id;
    // The approved action, rather than a model-generated call ID, owns its one
    // execution. Unchanged items reused by a revised batch keep their receipt.
    callKey = `approval:${approvalId}`;
  }
  const saved = await beginCall(context, { key: callKey, tool: tool.id, version: tool.version, input, effect: tool.effect, approvalId });
  if (saved.output) return tool.output.parse(saved.output);
  // A started call may have reached a provider before process loss. Never silently replay it.
  if (!saved.fresh && tool.recovery !== "composite") return result({ callId: saved.id }, { status: "unknown", missing: ["Previous execution has no saved receipt; reconcile before repeating"] });
  const started = Date.now();
  await event(context, "tool_started", { tool: tool.id, callId: saved.id });
  let output: ToolResult;
  try { output = tool.output.parse(await tool.execute(input, {...context,callId:saved.id})); }
  catch (error) {
    if (error instanceof LeaseLostError || error instanceof InstructionsChangedError) throw error;
    // Provider error bodies can contain private input or credentials. Persist a safe code only.
    output = result(null, { status: tool.effect === "send" || tool.effect === "destructive" ? "unknown" : "unavailable", missing: ["Tool failed; saved prior results remain available. Reconcile any uncertain side effect before repeating."], cost: tool.cost });
  }
  output.callId = saved.id;
  // A composite contains separately journaled/approved leaf actions. Keep its
  // parent open while waiting; re-entry reuses every completed leaf receipt.
  if (output.status === "waiting_approval" && tool.recovery === "composite") return output;
  const valid = output.status === "success" || output.status === "partial";
  await completeCall(context, saved.id, output, {
    inputItems: 1, validOutputItems: valid ? 1 : 0, downstreamUsedItems: null,
    inputTokens: null, outputTokens: null, apiCredits: tool.cost === "known" && tool.connections.length === 0 ? 0 : null,
    costUsd: tool.cost === "known" && tool.connections.length === 0 ? 0 : null, costState: output.cost,
    latencyMs: Date.now() - started, retries: 0, discardedReasonCounts: valid ? {} : { [output.status]: 1 },
    utilizationEfficiency: null, usageBoundary: "persisted-tool-output-not-yet-consumed", optimizationOpportunity: "Reuse stored evidence and call outputs before invoking providers again",
  });
  await event(context, "tool_result", { tool: tool.id, callId: saved.id, status: output.status, sources: output.sources, artifacts: output.artifacts, missing: output.missing, receipt: output.receipt });
  return output;
}
