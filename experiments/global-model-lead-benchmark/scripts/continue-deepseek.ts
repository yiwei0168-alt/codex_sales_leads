/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are validated at runtime */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { anthropicMessagesUrl, extractBenchmarkJson, loadContext, validateBenchmarkResult } from "../lib/benchmark";

nextEnv.loadEnvConfig(process.cwd());

const context = await loadContext("deepseek");
const outputDirectory = path.resolve("experiments/global-model-lead-benchmark", context.pilot.storage.rawResultsDirectory);
const rejectedPath = path.join(outputDirectory, `${context.runDate}-${context.pilot.countryCode}-deepseek.rejected.json`);
const rejected = JSON.parse(await readFile(rejectedPath, "utf8")) as any;

if (rejected.providerId !== "deepseek" || rejected.modelId !== context.provider.model.modelId) throw new Error("Rejected artifact does not match the configured DeepSeek model");
if (rejected.rawProviderResponse?.stop_reason !== "max_tokens") throw new Error("Rejected artifact is not eligible for an output-limit continuation");
if (!Array.isArray(rejected.rawProviderResponse?.content) || !rejected.rawProviderResponse.content.length) throw new Error("Rejected artifact has no reusable provider response content");
if (!Number.isInteger(rejected.searchRequestsObserved) || rejected.searchRequestsObserved < 1) throw new Error("Rejected artifact has no verified search count");

const apiKey = process.env[context.provider.credentials.apiKeyEnv]?.trim();
const baseUrl = (context.provider.credentials.baseUrl ?? process.env[context.provider.credentials.baseUrlEnv ?? ""] ?? "").trim().replace(/\/$/, "");
if (!apiKey || !baseUrl) throw new Error(`Missing ${context.provider.credentials.apiKeyEnv} or DeepSeek base URL`);

const continuationInstruction = [
  "This is page 2, the single allowed continuation for the benchmark response above.",
  "Do not search, call tools, add queries, or use facts outside the prior response and its embedded native-search evidence.",
  "Return one complete replacement JSON object, not a suffix and not a patch. Return JSON only with no Markdown or prose.",
  "Keep only the strongest evidence-supported records necessary to fit within the output limit; preserve observed facts, URLs, classifications, and exact public contact values without guessing.",
  `Set runMetadata.pageIndex to 2 and keep searchCapability.queriesExecutedCount and summaryMetrics.queriesExecutedCount exactly ${rejected.searchRequestsObserved}.`,
  "Recalculate every summary metric from the retained arrays. Set continuation.outputTruncated truthfully and provide precise nextActions if any records had to be omitted.",
].join(" ");

const startedAt = new Date().toISOString();
const response = await fetch(anthropicMessagesUrl("deepseek", baseUrl), {
  method: "POST",
  headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model: context.provider.model.modelId,
    system: context.prompt,
    messages: [
      { role: "user", content: context.trigger },
      { role: "assistant", content: rejected.rawProviderResponse.content },
      { role: "user", content: continuationInstruction },
    ],
    max_tokens: context.pilot.limits.visibleOutputTokens,
  }),
  signal: AbortSignal.timeout(context.pilot.limits.timeoutMinutesPerProvider * 60_000),
});

const responseText = await response.text();
let raw: any;
try { raw = JSON.parse(responseText); } catch { raw = { unparseableBody: responseText.slice(0, 1000) }; }
if (!response.ok) throw new Error(`DeepSeek continuation failed (${response.status}): ${responseText.slice(0, 500)}`);

const newSearches = (raw.content ?? []).filter((item: any) => item.type === "server_tool_use" && item.name === "web_search").length;
const text = (raw.content ?? []).filter((item: any) => item.type === "text").map((item: any) => item.text).join("");
const continuationPath = path.join(outputDirectory, `${context.runDate}-${context.pilot.countryCode}-deepseek-continuation.json`);
await mkdir(outputDirectory, { recursive: true });

try {
  if (newSearches !== 0) throw new Error(`Continuation unexpectedly initiated ${newSearches} search requests`);
  const result = extractBenchmarkJson(text) as any;
  validateBenchmarkResult(result, context);
  if (result.runMetadata.pageIndex !== 2) throw new Error(`Continuation pageIndex is ${result.runMetadata.pageIndex}, expected 2`);
  if (result.searchCapability.queriesExecutedCount !== rejected.searchRequestsObserved) throw new Error(`Continuation reports ${result.searchCapability.queriesExecutedCount} searches, expected ${rejected.searchRequestsObserved}`);

  const artifact = {
    providerId: "deepseek",
    modelId: context.provider.model.modelId,
    startedAt,
    completedAt: new Date().toISOString(),
    continuation: { pageIndex: 2, strategy: "compact_full_replacement", sourceArtifact: path.basename(rejectedPath), newSearchRequestsObserved: 0 },
    searchRequestsObserved: rejected.searchRequestsObserved,
    response: result,
    rawProviderResponse: raw,
  };
  await writeFile(path.join(outputDirectory, `${context.runDate}-${context.pilot.countryCode}-deepseek.json`), JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(continuationPath, JSON.stringify({ status: "accepted", ...artifact }, null, 2), "utf8");
  console.log(JSON.stringify({ providerId: artifact.providerId, modelId: artifact.modelId, status: "completed_and_validated", pageIndex: 2, newSearchRequestsObserved: 0, totalSearchRequestsObserved: artifact.searchRequestsObserved, stopReason: raw.stop_reason, summaryMetrics: result.summaryMetrics }, null, 2));
} catch (error) {
  const failure = {
    status: "rejected",
    providerId: "deepseek",
    modelId: context.provider.model.modelId,
    startedAt,
    completedAt: new Date().toISOString(),
    continuation: { pageIndex: 2, strategy: "compact_full_replacement", sourceArtifact: path.basename(rejectedPath), newSearchRequestsObserved: newSearches },
    validationError: error instanceof Error ? error.message : String(error),
    rawText: text,
    rawProviderResponse: raw,
  };
  await writeFile(path.join(outputDirectory, `${context.runDate}-${context.pilot.countryCode}-deepseek-continuation.rejected.json`), JSON.stringify(failure, null, 2), "utf8");
  throw error;
}
