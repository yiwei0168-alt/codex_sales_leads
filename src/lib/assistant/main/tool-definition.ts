import { z } from "zod";
import { toolResultSchema, type ExecutionContext, type ProductTool, type ToolResult } from "./contracts";
export function defineTool<T extends z.ZodType>(options: {
  id: string; description: string; input: T;
  execute: (input: z.infer<T>, context: ExecutionContext) => Promise<ToolResult>;
} & Partial<Pick<ProductTool, "role" | "effect" | "dependencies" | "connections" | "cost" | "recovery">>): ProductTool {
  return { version: "1", role: "member", effect: "read", dependencies: [], connections: [], cost: "known", recovery: "read-retry",
    ...options, output: toolResultSchema, execute: (input, context) => options.execute(options.input.parse(input), context) };
}
