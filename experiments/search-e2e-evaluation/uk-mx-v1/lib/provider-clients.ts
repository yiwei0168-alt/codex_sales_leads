import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

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
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  attempts: number;
  retries: number;
  parseError?: string;
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

function geminiSearchQueries(response: unknown): number {
  const body = response as { steps?: Array<{ type?: string; arguments?: { queries?: unknown[] } }> };
  const calls = (body.steps ?? []).filter((step) => step.type === "google_search_call");
  const queries = new Set(calls.flatMap((step) => step.arguments?.queries ?? [])
    .filter((query): query is string => typeof query === "string" && query.trim().length > 0)
    .map((query) => query.trim()));
  return queries.size || calls.length;
}

function tokenValue(usage: Record<string, unknown> | undefined, keys: string[]): number {
  for (const key of keys) if (typeof usage?.[key] === "number") return Math.max(0, usage[key] as number);
  return 0;
}

async function requestJsonWithRetry(url: string, init: RequestInit, maximumAttempts: number,
  timeoutMs: number): Promise<{ body: unknown; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const text = await response.text();
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const error = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        if (!retryable || attempt === maximumAttempts) throw error;
        lastError = error;
      } else {
        try { return { body: JSON.parse(text) as unknown, attempts: attempt }; }
        catch { throw new Error(`Provider returned non-JSON content: ${text.slice(0, 300)}`); }
      }
    } catch (error) {
      lastError = error;
      if (attempt === maximumAttempts) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Provider request failed");
}

export async function renderGeminiControlPrompt(cell: ExperimentCell): Promise<string> {
  const root = path.resolve("experiments/search-e2e-evaluation/uk-mx-v1");
  const [template, schema] = await Promise.all([
    readFile(path.join(root, "config/gemini-control-prompt.md"), "utf8"),
    readFile(path.join(root, "schemas/gemini-control-output.schema.json"), "utf8"),
  ]);
  return template.replace("[COUNTRY_NAME]", cell.countryName).replace("[COUNTRY_CODE]", cell.countryCode)
    .replace("[PRIMARY_LANGUAGE]", cell.primaryLanguage)
    .replace("[SUPPLEMENTARY_LANGUAGES]", cell.supplementaryLanguages.join(", ") || "none")
    .replace("[CATEGORY_LABEL]", cell.categoryLabel).replace("[CATEGORY_DEFINITION]", cell.categoryDefinition)
    .concat(`\n\nExact JSON Schema:\n${schema}`);
}

export async function callGeminiControl(cell: ExperimentCell,
  options: { prompt?: string; maxOutputTokens?: number } = {}): Promise<ProviderCall<GeminiControlOutput>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const requestedModel = "gemini-3.6-flash";
  const prompt = options.prompt ?? await renderGeminiControlPrompt(cell);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const response = await requestJsonWithRetry(geminiInteractionsUrl(), {
    method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ model: requestedModel, input: prompt, tools: [{ type: "google_search" }],
      generation_config: { thinking_level: "low", max_output_tokens: options.maxOutputTokens ?? 32_768 } }),
  }, 2, 180_000);
  const body = response.body as { model?: string; usage?: Record<string, unknown> };
  const text = geminiText(body);
  const parsed = parseStructured(text, geminiControlOutputSchema);
  const inputTokens = tokenValue(body.usage, ["input_tokens", "prompt_tokens", "inputTokenCount"]);
  const outputTokens = tokenValue(body.usage, ["output_tokens", "completion_tokens", "outputTokenCount"]);
  const reasoningTokens = tokenValue(body.usage, ["thoughtsTokenCount", "reasoning_tokens"]);
  return { output: parsed.output, raw: body, requestedModel, actualModel: body.model ?? requestedModel,
    usage: { inputTokens, outputTokens: Math.max(outputTokens, reasoningTokens), reasoningTokens,
      groundingQueries: geminiSearchQueries(body) }, startedAt, completedAt: new Date().toISOString(),
    latencyMs: Date.now() - started, attempts: response.attempts, retries: response.attempts - 1,
    ...(parsed.error ? { parseError: parsed.error } : {}) };
}

function anthropicMessagesUrl(): string {
  const raw = process.env.CLAUDE_BASE_URL?.trim() || "https://api.anthropic.com";
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("CLAUDE_BASE_URL must be HTTPS");
  return `${raw.replace(/\/+$/, "")}/v1/messages`;
}

export async function callClaudeBlindJudge(packet: Record<string, unknown>, model: string,
  maxTokens = 4_096): Promise<ProviderCall<BlindJudgeOutput>> {
  const apiKey = process.env.CLAUDE_API_KEY?.trim();
  if (!apiKey) throw new Error("CLAUDE_API_KEY is not configured");
  const rubric = await readFile(path.resolve("experiments/search-e2e-evaluation/uk-mx-v1/config/blind-judge-rubric.md"), "utf8");
  const schema = await readFile(path.resolve("experiments/search-e2e-evaluation/uk-mx-v1/schemas/blind-judge-output.schema.json"), "utf8");
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const response = await requestJsonWithRetry(anthropicMessagesUrl(), {
    method: "POST", headers: { "x-api-key": apiKey,
      "anthropic-version": process.env.CLAUDE_API_VERSION?.trim() || "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, output_config: { effort: "high" },
      system: `${rubric}\n\nReturn one JSON object only. Exact JSON Schema:\n${schema}`,
      messages: [{ role: "user", content: JSON.stringify(packet) }] }),
  }, 2, 180_000);
  const body = response.body as { model?: string; content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number } };
  const text = (body.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("");
  const parsed = parseStructured(text, blindJudgeOutputSchema);
  return { output: parsed.output, raw: body, requestedModel: model, actualModel: body.model ?? model,
    usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
    startedAt, completedAt: new Date().toISOString(), latencyMs: Date.now() - started,
    attempts: response.attempts, retries: response.attempts - 1,
    ...(parsed.error ? { parseError: parsed.error } : {}) };
}
