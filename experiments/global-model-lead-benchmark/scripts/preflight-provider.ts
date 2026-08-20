/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are inspected at runtime */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { anthropicMessagesUrl, loadContext, parseSseBuffer, type ProviderConfig, type ProviderId } from "../lib/benchmark";

nextEnv.loadEnvConfig(process.cwd());
const providerId = process.argv[2] as ProviderId | undefined;
if (!providerId || !["openai", "claude", "kimi", "deepseek", "grok"].includes(providerId)) throw new Error("Usage: npm run benchmark:preflight -- <openai|claude|kimi|deepseek|grok>");

type Stage = { name: "basic" | "native_search"; ok: boolean; latencyMs: number; category?: string; status?: number; detail?: Record<string, unknown> };
const startedAt = new Date().toISOString();
const context = await loadContext(providerId);

function credentials(provider: ProviderConfig) {
  const apiKey = process.env[provider.credentials.apiKeyEnv]?.trim();
  const baseUrl = (provider.credentials.baseUrl ?? process.env[provider.credentials.baseUrlEnv ?? ""] ?? "").trim().replace(/\/$/, "");
  if (!apiKey || !baseUrl) throw new Error(`Missing ${provider.credentials.apiKeyEnv} or base URL`);
  return { apiKey, baseUrl };
}

function classify(status: number, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("no available accounts")) return "account_pool_unavailable";
  if (status === 401 || status === 403) return "authentication_or_permission";
  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) return "rate_limit_or_quota";
  if (status === 504 || lower.includes("gateway time-out")) return "gateway_timeout";
  if (status === 503 || lower.includes("overloaded") || lower.includes("service_unavailable")) return "upstream_unavailable";
  if (status >= 500) return "upstream_server_error";
  return "protocol_or_request_error";
}

async function jsonRequest(url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 300) }; }
  if (!response.ok) throw Object.assign(new Error(JSON.stringify(body).slice(0, 500)), { status: response.status });
  return { status: response.status, body };
}

async function sseRequest(url: string, init: RequestInit): Promise<any[]> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw Object.assign(new Error((await response.text()).slice(0, 500)), { status: response.status });
  if (!response.body) throw new Error("SSE response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: any[] = [];
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseSseBuffer(buffer);
    events.push(...parsed.events);
    buffer = parsed.remainder;
    const error = parsed.events.find((event) => event.type === "error" || event.type === "response.failed");
    if (error) throw Object.assign(new Error(JSON.stringify(error).slice(0, 500)), { status: 503 });
    if (done) break;
  }
  return events;
}

function parseSingleJsonObject(text: string): Record<string, unknown> {
  try {
    const direct = JSON.parse(text) as unknown;
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, unknown>;
  } catch {
    // Search responses can contain citation text outside an otherwise valid JSON object.
  }
  const candidates: Record<string, unknown>[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "{") { if (depth === 0) start = index; depth += 1; }
    else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const value = JSON.parse(text.slice(start, index + 1)) as unknown;
          if (value && typeof value === "object" && !Array.isArray(value)) candidates.push(value as Record<string, unknown>);
        } catch {
          // Ignore balanced non-JSON text.
        }
        start = -1;
      }
    }
  }
  if (candidates.length !== 1) throw new Error(`Expected exactly one JSON object, found ${candidates.length}`);
  return candidates[0];
}

async function stage(name: Stage["name"], operation: () => Promise<Record<string, unknown>>): Promise<Stage> {
  const start = Date.now();
  try {
    const detail = await operation();
    return { name, ok: true, latencyMs: Date.now() - start, detail };
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 0);
    const message = error instanceof Error ? error.message : String(error);
    return { name, ok: false, latencyMs: Date.now() - start, status: status || undefined, category: classify(status, message), detail: { message: message.slice(0, 240) } };
  }
}

async function preflightOpenAi(): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const events = await sseRequest(`${baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({ model: context.provider.model.modelId, instructions: withSearch ? "Use exactly one native web search and answer concisely." : "Reply exactly OK.", input: withSearch ? "Find the official Cudy Technology homepage title and URL." : "Health check.", ...(withSearch ? { tools: [{ type: "web_search" }] } : {}), reasoning: { effort: "low" }, text: { verbosity: "low" }, max_output_tokens: withSearch ? 256 : 64, stream: true }),
    });
    const completed = events.findLast((event) => event.type === "response.completed")?.response;
    if (!completed) throw new Error("Missing response.completed");
    return { finalStatus: completed.status, webSearchCalls: events.filter((event) => event.type === "response.web_search_call.completed").length, eventCount: events.length };
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

async function preflightAnthropic(): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const { body } = await jsonRequest(anthropicMessagesUrl(context.providerId, baseUrl), { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: context.provider.model.modelId, system: withSearch ? "Use exactly one native web search. Do not use the entire system message as the query." : "Reply exactly OK.", messages: [{ role: "user", content: withSearch ? "Find the official Cudy Technology homepage title and URL." : "Health check." }], max_tokens: withSearch ? 256 : 32, ...(withSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }] } : {}) }) });
    const toolUses = (body.content ?? []).filter((item: any) => item.type === "server_tool_use" && item.name === "web_search");
    return { stopReason: body.stop_reason, webSearchCalls: toolUses.length, queryLengths: toolUses.map((item: any) => String(item.input?.query ?? "").length) };
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

async function preflightKimi(): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const messages: any[] = [{ role: "system", content: withSearch ? "Use exactly one native web search and answer concisely." : "Reply exactly OK." }, { role: "user", content: withSearch ? "Find the official Cudy Technology homepage title and URL." : "Health check." }];
    let toolCalls = 0;
    for (let round = 0; round < 3; round += 1) {
      const { body } = await jsonRequest(`${baseUrl}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: context.provider.model.modelId, messages, thinking: { type: "disabled" }, max_tokens: withSearch ? 512 : 64, ...(withSearch ? { tools: [{ type: "builtin_function", function: { name: "$web_search" } }] } : {}) }) });
      const choice = body.choices?.[0];
      if (!choice) throw new Error("Kimi returned no choice");
      messages.push(choice.message);
      if (choice.finish_reason !== "tool_calls") return { finishReason: choice.finish_reason, toolCalls, finalTextPresent: Boolean(choice.message.content) };
      for (const toolCall of choice.message.tool_calls ?? []) {
        toolCalls += 1;
        messages.push({ role: "tool", tool_call_id: toolCall.id, name: toolCall.function.name, content: toolCall.function.arguments });
      }
    }
    throw new Error("Kimi did not finish within two tool continuations");
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

async function preflightGrok(): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const instructions = withSearch
      ? "Use exactly one native web search. Return one JSON object with string fields title and url, with no prose."
      : "Reply exactly OK.";
    const events = await sseRequest(`${baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        model: context.provider.model.modelId,
        instructions,
        input: withSearch ? "Find the official Cudy Technology homepage title and URL." : "Health check.",
        reasoning: { effort: "low" },
        max_output_tokens: withSearch ? 256 : 64,
        stream: true,
        ...(withSearch ? { tools: [{ type: "web_search" }], tool_choice: "required", parallel_tool_calls: false, include: ["web_search_call.action.sources", "no_inline_citations"], max_turns: 1, text: { format: { type: "json_object" } } } : {}),
      }),
    });
    const completed = events.findLast((event) => event.type === "response.completed")?.response;
    if (!completed) throw new Error("Missing response.completed");
    const searchItems = (completed.output ?? []).filter((item: any) => item.type === "web_search_call");
    const text = (completed.output ?? []).flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("");
    if (withSearch) {
      if (searchItems.length !== 1) throw new Error(`Expected one Grok web search, observed ${searchItems.length}`);
      const parsed = parseSingleJsonObject(text);
      if (typeof parsed.title !== "string" || typeof parsed.url !== "string") throw new Error("Grok structured search result lacks title or url");
    }
    return { finalStatus: completed.status, webSearchCalls: searchItems.length, finalTextPresent: Boolean(text), outputTextBlocks: (completed.output ?? []).flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === "output_text").length, structuredJsonParsed: withSearch ? true : undefined };
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

const stages = providerId === "openai" ? await preflightOpenAi() : providerId === "grok" ? await preflightGrok() : providerId === "kimi" ? await preflightKimi() : await preflightAnthropic();
const report = { providerId, modelId: context.provider.model.modelId, startedAt, completedAt: new Date().toISOString(), automaticRetries: 0, healthy: stages.length === 2 && stages.every((item) => item.ok), stages };
const outputDirectory = path.resolve("experiments/global-model-lead-benchmark/runs/raw");
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, `${context.runDate}-${providerId}-preflight.json`), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.healthy) process.exitCode = 1;
