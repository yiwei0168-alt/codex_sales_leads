import { z } from "zod";
import { getOpenRouterConfig } from "@/providers/openrouter";
import { budgetedFetch } from "@/lib/billing/paid-fetch";
import type { ModelConfig, ModelMessage } from "./contracts";
import { assertOpenRouterResponse } from "@/providers/openrouter-batch";

export const modelReplySchema = z.object({
  role: z.literal("assistant"), content: z.string().nullable().optional(),
  tool_calls: z.array(z.object({ id: z.string().min(1).max(200), type: z.literal("function"),
    function: z.object({ name: z.string().max(100), arguments: z.string().max(100_000) }) })).max(12).optional(),
});
export const modelFunctions = [
  { type: "function", function: { name: "discover_tools", description: "List accessible product capabilities", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "describe_tool", description: "Load a tool's full input/output schema and execution contract", parameters: { type: "object", properties: { tool: { type: "string" } }, required: ["tool"], additionalProperties: false } } },
  { type: "function", function: { name: "execute_tool", description: "Execute a described capability under server-injected account permissions", parameters: { type: "object", properties: { tool: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["tool", "arguments"], additionalProperties: false } } },
];
export async function requestModel(messages: ModelMessage[], config: ModelConfig, transport: typeof fetch = fetch) {
  if(config.model.endsWith(":batch"))throw new Error("Batch model requires the durable asynchronous transport");
  const route = getOpenRouterConfig();
  const glmSync = config.model === "z-ai/glm-5.3";
  const response = await budgetedFetch(transport)(`${route.baseUrl}/chat/completions`, {
    method: "POST", headers: { ...route.defaultHeaders, Authorization: `Bearer ${route.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages, tools: modelFunctions, tool_choice: "auto",
      ...(glmSync ? { max_tokens: 16_384 } : { max_completion_tokens: 16_384, parallel_tool_calls: false }),
      provider: { ...route.providerPreferences, only: config.providers, allow_fallbacks: false } }),
    signal: AbortSignal.timeout(180_000), redirect: "error",
  });
  await assertOpenRouterResponse(response);
  return parseModelResponse(await response.json());
}
export function parseModelResponse(value:unknown) {
  const body = z.object({ choices: z.array(z.object({ message: modelReplySchema, finish_reason: z.string() })).min(1),
    usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), cost: z.number().optional() }).optional(),
  }).parse(value);
  if (!["stop", "tool_calls"].includes(body.choices[0].finish_reason)) throw new Error("Main model output incomplete");
  const reply = body.choices[0].message;
  if (!reply.content?.trim() && !reply.tool_calls?.length) throw new Error("Main model returned no content");
  if (new Set(reply.tool_calls?.map(c => c.id)).size !== (reply.tool_calls?.length ?? 0)) throw new Error("Duplicate tool call identity");
  return { message: { ...reply, content: reply.content ?? null } as ModelMessage, usage: body.usage };
}
