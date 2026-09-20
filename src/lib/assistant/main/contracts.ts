import { createHash } from "node:crypto";
import { z } from "zod";

export const runStatuses = ["queued", "running", "waiting_user", "paused", "partial", "completed", "failed", "cancelled"] as const;
export type RunStatus = typeof runStatuses[number];
export type Effect = "read" | "reversible" | "send" | "destructive" | "publish";
export interface ExecutionContext { userId: string; runId: string; leaseToken: string; role: "admin" | "member" }
export const toolResultSchema = z.object({
  status: z.enum(["success", "partial", "missing_input", "waiting_approval", "unavailable", "unknown"]),
  data: z.unknown().optional(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
  artifacts: z.array(z.object({ id: z.string(), title: z.string(), url: z.string().optional() })).default([]),
  missing: z.array(z.string()).default([]),
  cost: z.enum(["known", "estimated", "unknown"]).default("unknown"),
  receipt: z.string().optional(),
  callId: z.uuid().optional(),
});
export type ToolResult = z.infer<typeof toolResultSchema>;
export interface ProductTool {
  id: string; version: string; description: string;
  input: z.ZodType; output: typeof toolResultSchema;
  role: "member" | "admin"; effect: Effect;
  dependencies: string[]; connections: string[];
  cost: "known" | "estimated" | "unknown";
  recovery: "read-retry" | "idempotent" | "reconcile";
  execute: (input: unknown, context: ExecutionContext) => Promise<ToolResult>;
}
export function result(data: unknown, extra: Partial<ToolResult> = {}): ToolResult {
  return toolResultSchema.parse({ status: "success", data, ...extra });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function digest(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
export const messageInputSchema = z.object({
  conversationId: z.uuid().optional(), content: z.string().trim().min(2).max(100_000),
  requestKey: z.string().min(8).max(120),
  attachments: z.array(z.object({ assetId: z.uuid() }).strict()).max(20).default([]),
}).strict();
export type MessageInput = z.infer<typeof messageInputSchema>;
export interface ModelConfig { model: string; providers: string[]; version: string }
export interface AgentRun {
  id: string; user_id: string; conversation_id: string; status: RunStatus;
  input: MessageInput; result: { reply: string } | null; model_config: ModelConfig;
  instructions: Array<{ id: string; content: string }>; control: "pause" | "cancel" | null;
  lease_token: string | null;
}
export interface ModelToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool"; content: string | null;
  tool_call_id?: string; tool_calls?: ModelToolCall[];
}
