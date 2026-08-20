/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are inspected at runtime */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { loadContext } from "../lib/benchmark";

nextEnv.loadEnvConfig(process.cwd());

const context = await loadContext("kimi");
const apiKey = process.env[context.provider.credentials.apiKeyEnv]?.trim();
const baseUrl = (context.provider.credentials.baseUrl ?? process.env[context.provider.credentials.baseUrlEnv ?? ""] ?? "").trim().replace(/\/$/, "");
if (!apiKey || !baseUrl) throw new Error(`Missing ${context.provider.credentials.apiKeyEnv} or Kimi base URL`);

const startedAt = new Date().toISOString();
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({
    model: context.provider.model.modelId,
    messages: [
      { role: "system", content: "Return exactly one JSON object with string field status and integer field value. Do not include prose or Markdown." },
      { role: "user", content: "Return status ok and value 2." },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    max_completion_tokens: 128,
  }),
  signal: AbortSignal.timeout(180_000),
});

const responseText = await response.text();
let raw: any;
try { raw = JSON.parse(responseText); } catch { raw = { unparseableBody: responseText.slice(0, 1000) }; }
let parsed: any;
let validationError: string | null = null;
try {
  if (!response.ok) throw new Error(`Kimi JSON-mode request failed (${response.status}): ${responseText.slice(0, 500)}`);
  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Kimi JSON-mode response has no text content");
  parsed = JSON.parse(content);
  if (parsed?.status !== "ok" || parsed?.value !== 2) throw new Error("Kimi JSON-mode response did not match the requested object");
} catch (error) {
  validationError = error instanceof Error ? error.message : String(error);
}

const report = {
  providerId: "kimi",
  modelId: context.provider.model.modelId,
  startedAt,
  completedAt: new Date().toISOString(),
  test: "minimal_json_mode_without_search",
  requestSettings: { thinking: "disabled", responseFormat: "json_object", maxCompletionTokens: 128, nativeSearchEnabled: false },
  status: validationError ? "failed" : "passed",
  httpStatus: response.status,
  finishReason: raw.choices?.[0]?.finish_reason ?? null,
  parsedShapeValid: !validationError,
  validationError,
  rawProviderResponse: raw,
};

const outputDirectory = path.resolve("experiments/global-model-lead-benchmark", context.pilot.storage.rawResultsDirectory);
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, `${context.runDate}-kimi-json-mode-preflight.json`), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ ...report, rawProviderResponse: undefined }, null, 2));
if (validationError) process.exitCode = 1;
