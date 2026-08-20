/* eslint-disable @typescript-eslint/no-explicit-any -- provider responses are inspected at runtime */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { anthropicMessagesUrl, collectSourceUrls, loadContext, parseSseBuffer, type ProviderConfig, type ProviderId } from "../lib/benchmark";

nextEnv.loadEnvConfig(process.cwd());
const providerId = process.argv[2] as ProviderId | undefined;
if (!providerId || !["openai", "claude", "kimi", "deepseek", "grok"].includes(providerId)) {
  throw new Error("Usage: npm run benchmark:preflight -- <openai|claude|kimi|deepseek|grok>");
}

type Stage = {
  name: "basic" | "native_search";
  ok: boolean;
  latencyMs: number;
  category?: string;
  status?: number;
  detail?: Record<string, unknown>;
};

const startedAt = new Date().toISOString();
const context = await loadContext(providerId);
const searchPrompt = "请使用你所在模型服务的原生联网搜索，找到 Cudy Technology 官方网站，并用自然语言回答网站标题和URL。不要使用训练记忆代替搜索。";

function credentials(provider: ProviderConfig) {
  const apiKey = process.env[provider.credentials.apiKeyEnv]?.trim();
  const baseUrl = (provider.credentials.baseUrl ?? process.env[provider.credentials.baseUrlEnv ?? ""] ?? "").trim().replace(/\/$/, "");
  if (!apiKey || !baseUrl) throw new Error(`Missing ${provider.credentials.apiKeyEnv} or base URL`);
  return { apiKey, baseUrl };
}

function classify(status: number, message: string): string {
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) return "authentication_or_permission";
  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) return "rate_limit_or_quota";
  if (status === 504 || lower.includes("time-out") || lower.includes("timeout") || lower.includes("aborted")) return "gateway_timeout";
  if (status === 503 || lower.includes("overloaded") || lower.includes("service_unavailable")) return "upstream_unavailable";
  if (status >= 500) return "upstream_server_error";
  return "protocol_or_request_error";
}

async function jsonRequest(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 300) }; }
  if (!response.ok) throw Object.assign(new Error(JSON.stringify(body).slice(0, 500)), { status: response.status });
  return body;
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
    const failed = parsed.events.find((event) => event.type === "error" || event.type === "response.failed");
    if (failed) throw Object.assign(new Error(JSON.stringify(failed).slice(0, 500)), { status: 503 });
    if (done) break;
  }
  return events;
}

function outputText(response: any): string {
  return (response.output ?? []).flatMap((item: any) => item.content ?? [])
    .filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("");
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

async function preflightResponses(provider: "openai" | "grok"): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const body = {
      model: context.provider.model.modelId,
      input: withSearch ? searchPrompt : "请只回复 OK。",
      reasoning: { effort: "none" },
      max_output_tokens: withSearch ? 512 : 64,
      stream: true,
      ...(withSearch ? {
        tools: [{ type: "web_search" }],
        ...(provider === "openai" ? { max_tool_calls: 1 } : { max_turns: 1 }),
      } : {}),
    };
    const events = await sseRequest(`${baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = events.findLast((event) => event.type === "response.completed")?.response;
    if (!response) throw new Error("Missing response.completed");
    const completedEvents = events.filter((event) => event.type === "response.web_search_call.completed").length;
    const outputItems = (response.output ?? []).filter((item: any) => item.type === "web_search_call").length;
    const searches = Math.max(completedEvents, outputItems);
    const text = outputText(response);
    const urls = collectSourceUrls([text, response]);
    if (withSearch && searches < 1) throw new Error("No provider-native web search call was observed");
    if (!text.trim()) throw new Error("No final natural-language text was returned");
    return { responseStatus: response.status, webSearchCalls: searches, finalTextPresent: true, sourceUrlCount: urls.length };
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

async function preflightAnthropic(): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const body = await jsonRequest(anthropicMessagesUrl(context.providerId, baseUrl), {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: context.provider.model.modelId,
        max_tokens: withSearch ? 512 : 64,
        messages: [{ role: "user", content: withSearch ? searchPrompt : "请只回复 OK。" }],
        ...(context.providerId === "deepseek" ? { thinking: { type: "disabled" } } : {}),
        ...(withSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }] } : {}),
      }),
    });
    const searches = Number(body.usage?.server_tool_use?.web_search_requests
      ?? (body.content ?? []).filter((item: any) => item.type === "server_tool_use" && item.name === "web_search").length);
    const text = (body.content ?? []).filter((item: any) => item.type === "text").map((item: any) => item.text).join("");
    const urls = collectSourceUrls([text, body]);
    if (withSearch && searches < 1) throw new Error("No provider-native web search call was observed");
    if (!text.trim()) throw new Error("No final natural-language text was returned");
    return { stopReason: body.stop_reason, webSearchCalls: searches, finalTextPresent: true, sourceUrlCount: urls.length };
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

async function preflightKimi(): Promise<Stage[]> {
  const { apiKey, baseUrl } = credentials(context.provider);
  const request = async (withSearch: boolean) => {
    const messages: any[] = [{ role: "user", content: withSearch ? searchPrompt : "请只回复 OK。" }];
    let searches = 0;
    const rawRounds: any[] = [];
    for (let round = 0; round < 3; round += 1) {
      const body = await jsonRequest(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: context.provider.model.modelId,
          messages,
          thinking: { type: "disabled" },
          max_completion_tokens: withSearch ? 512 : 64,
          ...(withSearch ? { tools: [{ type: "builtin_function", function: { name: "$web_search" } }] } : {}),
        }),
      });
      rawRounds.push(body);
      const choice = body.choices?.[0];
      if (!choice) throw new Error("Kimi returned no choice");
      messages.push(choice.message);
      if (choice.finish_reason !== "tool_calls") {
        const text = choice.message.content ?? "";
        if (withSearch && searches < 1) throw new Error("No provider-native web search call was observed");
        if (!text.trim()) throw new Error("No final natural-language text was returned");
        return { finishReason: choice.finish_reason, webSearchCalls: searches, finalTextPresent: true, sourceUrlCount: collectSourceUrls([text, rawRounds]).length };
      }
      for (const toolCall of choice.message.tool_calls ?? []) {
        searches += 1;
        messages.push({ role: "tool", tool_call_id: toolCall.id, name: toolCall.function.name, content: toolCall.function.arguments });
      }
    }
    throw new Error("Kimi did not finish within two internal tool continuations");
  };
  const basic = await stage("basic", () => request(false));
  return basic.ok ? [basic, await stage("native_search", () => request(true))] : [basic];
}

const stages = providerId === "openai" || providerId === "grok"
  ? await preflightResponses(providerId)
  : providerId === "kimi" ? await preflightKimi() : await preflightAnthropic();
const report = {
  protocolVersion: context.pilot.protocolVersion,
  providerId,
  modelId: context.provider.model.modelId,
  startedAt,
  completedAt: new Date().toISOString(),
  automaticRetries: 0,
  healthy: stages.length === 2 && stages.every((item) => item.ok),
  stages,
};
const outputDirectory = path.resolve("experiments/global-model-lead-benchmark/runs/raw");
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, `${context.runDate}-${providerId}-v2-preflight.json`), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.healthy) process.exitCode = 1;
