import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { getOpenRouterConfig, openRouterChatCompletionsUrl, openRouterRequestHeaders,
  resolveOpenRouterModel } from "@/providers/openrouter";

import type { ExperimentUsage } from "./cost-ledger";
import type { ExperimentCell } from "./experiment";
import { blindJudgeOutputSchema, geminiControlOutputSchema, type BlindJudgeOutput,
  type GeminiControlOutput } from "./runtime-schemas";

interface ProviderCall<T> {
  output: T | null;
  raw: unknown;
  requestedModel: string;
  actualModel: string;
  usage: ExperimentUsage;
  accountCashCostUsd?: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  attempts: number;
  retries: number;
  parseError?: string;
  requestError?: string;
  requestFailureKind?: ProviderRequestFailureKind;
}

export type ProviderRequestFailureKind = "transport" | "timeout" | "http" | "invalid-response";

class ProviderRequestError extends Error {
  constructor(message: string, readonly attempts: number, readonly failureKind: ProviderRequestFailureKind,
    options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "ProviderRequestError";
  }
}

type JsonSchema = Record<string, unknown>;

const geminiSchemaKeys = new Set([
  "type", "properties", "required", "items", "enum",
]);

/** Keep the minimal cross-tool subset accepted by Gemini structured output with Google Search. */
export function sanitizeGeminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeGeminiJsonSchema);
  if (!value || typeof value !== "object") return value;
  const output: JsonSchema = {};
  for (const [key, item] of Object.entries(value as JsonSchema)) {
    if (!geminiSchemaKeys.has(key)) continue;
    if (key === "properties" && item && typeof item === "object" && !Array.isArray(item)) {
      output[key] = Object.fromEntries(Object.entries(item as JsonSchema)
        .map(([property, schema]) => [property, sanitizeGeminiJsonSchema(schema)]));
    } else if (["items", "additionalProperties"].includes(key)) {
      output[key] = sanitizeGeminiJsonSchema(item);
    } else if (["prefixItems", "anyOf"].includes(key) && Array.isArray(item)) {
      output[key] = item.map(sanitizeGeminiJsonSchema);
    } else {
      output[key] = item;
    }
  }
  return output;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function parseStructured<T>(text: string, schema: z.ZodType<T>): { output: T | null; error?: string } {
  try {
    return { output: schema.parse(JSON.parse(stripJsonFence(text))) };
  } catch (error) {
    return { output: null, error: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000) };
  }
}

function geminiInteractionsUrl(): string {
  let base = (process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta")
    .replace(/\/+$/, "").replace(/\/openai(?:\/v1)?$/i, "");
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" || parsed.hostname !== "generativelanguage.googleapis.com") {
    throw new Error("GEMINI_BASE_URL must use the trusted Google Generative Language HTTPS endpoint");
  }
  if (!/\/v1(?:beta)?$/i.test(base)) base = `${base}/v1beta`;
  return `${base}/interactions`;
}

function geminiText(response: unknown): string {
  const body = response as { steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  return (body.steps ?? []).filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? []).filter((content) => content.type === "text")
    .map((content) => content.text ?? "").join("");
}

export function geminiSearchQueries(response: unknown): number {
  const body = response as { steps?: Array<{ type?: string; arguments?: { queries?: unknown[] } }>;
    usage?: { grounding_tool_count?: Array<{ type?: string; count?: number }> } };
  const calls = (body.steps ?? []).filter((step) => step.type === "google_search_call");
  const queries = new Set(calls.flatMap((step) => step.arguments?.queries ?? [])
    .filter((query): query is string => typeof query === "string" && query.trim().length > 0)
    .map((query) => query.trim()));
  const observedSteps = queries.size || calls.length;
  const reportedUsage = (body.usage?.grounding_tool_count ?? [])
    .filter((item) => item.type === "google_search")
    .reduce((sum, item) => sum + (typeof item.count === "number" ? Math.max(0, item.count) : 0), 0);
  return Math.max(observedSteps, reportedUsage);
}

function tokenValue(usage: Record<string, unknown> | undefined, keys: string[]): number {
  for (const key of keys) if (typeof usage?.[key] === "number") return Math.max(0, usage[key] as number);
  return 0;
}

async function requestJsonWithRetry(url: string, init: RequestInit, maximumAttempts: number,
  timeoutMs: number): Promise<{ body: unknown; attempts: number }> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (attempt < maximumAttempts) continue;
      const name = error instanceof Error ? error.name : "";
      const failureKind: ProviderRequestFailureKind = ["AbortError", "TimeoutError"].includes(name)
        ? "timeout" : "transport";
      throw new ProviderRequestError(error instanceof Error ? error.message : String(error), attempt, failureKind,
        { cause: error });
    }
    const text = await response.text();
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (retryable && attempt < maximumAttempts) continue;
      throw new ProviderRequestError(`HTTP ${response.status}: ${text.slice(0, 500)}`, attempt, "http");
    }
    try { return { body: JSON.parse(text) as unknown, attempts: attempt }; }
    catch (error) {
      throw new ProviderRequestError(`Provider returned non-JSON content: ${text.slice(0, 300)}`,
        attempt, "invalid-response", { cause: error });
    }
  }
  throw new ProviderRequestError("Provider request failed", maximumAttempts, "transport");
}

export async function renderGeminiControlPrompt(cell: ExperimentCell): Promise<string> {
  const root = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1");
  const template = await readFile(path.join(root, "config/gemini-control-prompt.md"), "utf8");
  return template.replace("[COUNTRY_NAME]", cell.countryName).replace("[COUNTRY_CODE]", cell.countryCode)
    .replace("[PRIMARY_LANGUAGE]", cell.primaryLanguage)
    .replace("[SUPPLEMENTARY_LANGUAGES]", cell.supplementaryLanguages.join(", ") || "none")
    .replace("[CATEGORY_LABEL]", cell.categoryLabel).replace("[CATEGORY_DEFINITION]", cell.categoryDefinition);
}

async function geminiControlResponseFormat(): Promise<Record<string, unknown>> {
  const filename = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1/schemas/gemini-control-output.schema.json");
  const schema = JSON.parse(await readFile(filename, "utf8")) as unknown;
  return { type: "text", mime_type: "application/json", schema: sanitizeGeminiJsonSchema(schema) };
}

export async function callGeminiControl(cell: ExperimentCell,
  options: { prompt?: string; maxOutputTokens?: number } = {}): Promise<ProviderCall<GeminiControlOutput>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const requestedModel = "gemini-3.6-flash";
  const prompt = options.prompt ?? await renderGeminiControlPrompt(cell);
  const responseFormat = await geminiControlResponseFormat();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let response: Awaited<ReturnType<typeof requestJsonWithRetry>>;
  try {
    response = await requestJsonWithRetry(geminiInteractionsUrl(), {
      method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ model: requestedModel, input: prompt, tools: [{ type: "google_search" }],
        response_format: responseFormat,
        generation_config: { thinking_level: "low", max_output_tokens: options.maxOutputTokens ?? 32_768 } }),
    }, 2, 180_000);
  } catch (error) {
    if (!(error instanceof ProviderRequestError)) throw error;
    return { output: null, raw: null, requestedModel, actualModel: requestedModel, usage: {}, startedAt,
      completedAt: new Date().toISOString(), latencyMs: Date.now() - started, attempts: error.attempts,
      retries: Math.max(0, error.attempts - 1), requestError: error.message,
      requestFailureKind: error.failureKind };
  }
  const body = response.body as { model?: string; usage?: Record<string, unknown> };
  const text = geminiText(body);
  const parsed = parseStructured(text, geminiControlOutputSchema);
  const inputTokens = tokenValue(body.usage, ["total_input_tokens", "input_tokens", "prompt_tokens", "inputTokenCount"]);
  const cachedInputTokens = tokenValue(body.usage, ["total_cached_tokens", "cached_tokens", "cachedTokenCount"]);
  const visibleOutputTokens = tokenValue(body.usage,
    ["total_output_tokens", "output_tokens", "completion_tokens", "outputTokenCount"]);
  const reasoningTokens = tokenValue(body.usage,
    ["total_thought_tokens", "thoughtsTokenCount", "reasoning_tokens"]);
  return { output: parsed.output, raw: body, requestedModel, actualModel: body.model ?? requestedModel,
    usage: { inputTokens, cachedInputTokens, outputTokens: visibleOutputTokens + reasoningTokens, reasoningTokens,
      groundingQueries: geminiSearchQueries(body) }, startedAt, completedAt: new Date().toISOString(),
    latencyMs: Date.now() - started, attempts: response.attempts, retries: response.attempts - 1,
    ...(parsed.error ? { parseError: parsed.error } : {}) };
}

export async function callClaudeBlindJudge(packet: Record<string, unknown>, model: string,
  maxTokens = 4_096): Promise<ProviderCall<BlindJudgeOutput>> {
  const config = getOpenRouterConfig();
  const requestedModel = resolveOpenRouterModel(model, /(?:^|\/)gpt-/i.test(model) ? "openai" : "anthropic");
  const rubric = await readFile(path.resolve("experiments/search-e2e-evaluation/uk-mx-v1/config/blind-judge-rubric.md"), "utf8");
  const schema = JSON.parse(await readFile(path.resolve("experiments/search-e2e-evaluation/uk-mx-v1/schemas/blind-judge-output.schema.json"), "utf8")) as Record<string, unknown>;
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let response: Awaited<ReturnType<typeof requestJsonWithRetry>>;
  try {
    response = await requestJsonWithRetry(openRouterChatCompletionsUrl(config), {
      method: "POST", headers: openRouterRequestHeaders(config),
      body: JSON.stringify({ model: requestedModel, max_tokens: maxTokens, temperature: 0,
        reasoning: { effort: "high" },
        provider: config.providerPreferences,
        response_format: { type: "json_schema", json_schema: { name: "blind_judge_output", strict: true, schema } },
        messages: [{ role: "system", content: `${rubric}\n\nReturn one JSON object only.` },
          { role: "user", content: JSON.stringify(packet) }] }),
    }, 2, 180_000);
  } catch (error) {
    if (!(error instanceof ProviderRequestError)) throw error;
    return { output: null, raw: null, requestedModel, actualModel: requestedModel, usage: {}, startedAt,
      completedAt: new Date().toISOString(), latencyMs: Date.now() - started, attempts: error.attempts,
      retries: Math.max(0, error.attempts - 1), requestError: error.message,
      requestFailureKind: error.failureKind };
  }
  const body = response.body as { model?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
  const text = body.choices?.[0]?.message?.content ?? "";
  const parsed = parseStructured(text, blindJudgeOutputSchema);
  return { output: parsed.output, raw: body, requestedModel, actualModel: body.model ?? requestedModel,
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
    accountCashCostUsd: body.usage?.cost,
    startedAt, completedAt: new Date().toISOString(), latencyMs: Date.now() - started,
    attempts: response.attempts, retries: response.attempts - 1,
    ...(parsed.error ? { parseError: parsed.error } : {}) };
}
