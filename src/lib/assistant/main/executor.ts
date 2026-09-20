import { z } from "zod";
import { availableTools, describeTool, productTools } from "./tools";
import { result, type ExecutionContext, type ModelToolCall, type ToolResult } from "./contracts";
import { executeRegisteredTool } from "./tool-execution";
export { executeRegisteredTool } from "./tool-execution";

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
