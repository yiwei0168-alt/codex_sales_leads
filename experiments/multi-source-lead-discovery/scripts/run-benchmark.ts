import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import type { DiscoveryProviderId, DiscoveryProviderResult } from "../lib/contracts";
import {
  canonicalPublicUrl,
  evaluateChannel,
  isUsefulPublicUrl,
  sanitizeText,
  type ChannelId,
  type EvaluatedChannel,
} from "../lib/evaluation";
import { createDiscoveryProvider, runGeminiFullSearch } from "../lib/providers";

nextEnv.loadEnvConfig(process.cwd());

type SystemId = "gemini-full" | `product-${DiscoveryProviderId}`;
type Phase = "preflight" | "discovery" | "evaluate" | "all";

interface BenchmarkConfig {
  protocolVersion: string;
  status: string;
  countryCode: string;
  countryName: string;
  languageCode: string;
  preflight: { query: string; maxResults: number; timeoutMs: number };
  measuredSystems: Array<{ id: SystemId; mode: string; discoveryProvider: DiscoveryProviderId }>;
  execution: {
    frozenAt: string;
    runId: string;
    queriesPerChannel: number;
    maxResultsPerQuery: number;
    providerRequestRetryLimit: number;
    requestTimeoutMs: number;
    runOrder: SystemId[];
  };
}

interface InputsConfig {
  promptVersion: string;
  cudyBrief: string;
  compactRoleRules: string[];
  commonDiscoveryBrief: string;
  geminiFullPrompt: string;
  channels: Array<{ id: ChannelId; label: string; eligibleRoles: string[]; queries: string[] }>;
  downstreamEvaluator: {
    model: string;
    temperature: number;
    maxOutputTokens: number;
    systemPrompt: string;
    taskPrompt: string;
    fixedListEvaluationPrompt: string;
  };
}

const root = path.resolve("experiments/multi-source-lead-discovery");
const [benchmarkText, inputsText] = await Promise.all([
  readFile(path.join(root, "config/benchmark.json"), "utf8"),
  readFile(path.join(root, "config/inputs.json"), "utf8"),
]);
const benchmark = JSON.parse(benchmarkText) as BenchmarkConfig;
const inputs = JSON.parse(inputsText) as InputsConfig;
const phase = (process.argv.find((argument) => argument.startsWith("--phase="))?.split("=")[1] ?? "all") as Phase;
if (!["preflight", "discovery", "evaluate", "all"].includes(phase)) throw new Error(`Unknown phase: ${phase}`);
if (benchmark.status !== "frozen-ready-to-run") throw new Error("Benchmark protocol is not frozen");
if (Date.now() < Date.parse(benchmark.execution.frozenAt)) throw new Error("Frozen benchmark time is in the future");
if (inputs.channels.some((channel) => channel.queries.length !== benchmark.execution.queriesPerChannel)) {
  throw new Error("Query pack does not match the frozen request budget");
}

const rawRoot = path.join(root, "runs/raw", benchmark.execution.runId);
const artifactRoot = path.join(root, "artifacts/runs", benchmark.execution.runId);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(): string {
  const local = new Date(Date.now() + 8 * 60 * 60 * 1_000);
  return local.toISOString().replace("Z", "+08:00");
}

async function writeJson(filename: string, value: unknown): Promise<string> {
  await mkdir(path.dirname(filename), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filename, content, "utf8");
  return sha256(content);
}

async function readJson<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

function errorRecord(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message.slice(0, 2_000) }
    : { name: "Error", message: String(error).slice(0, 2_000) };
}

function committedResult(result: DiscoveryProviderResult): Omit<DiscoveryProviderResult, "rawResponse"> {
  return {
    providerId: result.providerId,
    query: result.query,
    items: result.items.filter((item) => isUsefulPublicUrl(item.url)).map((item) => ({
      ...item,
      title: sanitizeText(item.title),
      url: canonicalPublicUrl(item.url),
      snippet: sanitizeText(item.snippet),
    })),
    answerText: result.answerText ? sanitizeText(result.answerText) : undefined,
    sourceUrls: [...new Set(result.sourceUrls.filter(isUsefulPublicUrl).flatMap((url) => canonicalPublicUrl(url) ?? []))],
    requestCount: result.requestCount,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}

async function measuredCall(
  basePath: string,
  operation: () => Promise<DiscoveryProviderResult>,
  validate?: (result: DiscoveryProviderResult) => void,
): Promise<{ result: DiscoveryProviderResult; rawSha256: string; attempts: number }> {
  const resultPath = `${basePath}.result.json`;
  try {
    const existing = await readJson<{ result: DiscoveryProviderResult; attempts: number }>(resultPath);
    validate?.(existing.result);
    return { result: existing.result, rawSha256: sha256(await readFile(resultPath)), attempts: existing.attempts };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Existing result rejected, retrying ${basePath}: ${errorRecord(error).message}`);
    }
  }

  const maximumAttempts = benchmark.execution.providerRequestRetryLimit + 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const startedAt = timestamp();
    try {
      const result = await operation();
      validate?.(result);
      await writeJson(`${basePath}.attempt-${attempt}.json`, { startedAt, status: "succeeded", result });
      const rawSha256 = await writeJson(resultPath, { startedAt, status: "succeeded", attempts: attempt, result });
      return { result, rawSha256, attempts: attempt };
    } catch (error) {
      lastError = error;
      await writeJson(`${basePath}.attempt-${attempt}.json`, {
        startedAt, finishedAt: timestamp(), status: "failed", error: errorRecord(error),
      });
      if (attempt < maximumAttempts) console.warn(`Retrying ${basePath} after attempt ${attempt}`);
    }
  }
  throw lastError;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(cleaned) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
    return value as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini Full did not return JSON");
    const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
    return value as Record<string, unknown>;
  }
}

function geminiChannels(result: DiscoveryProviderResult): Map<ChannelId, unknown[]> {
  if (!result.answerText) throw new Error("Gemini Full returned no answer text");
  const parsed = parseJsonObject(result.answerText);
  if (!Array.isArray(parsed.channels)) throw new Error("Gemini Full JSON has no channels array");
  const channels = new Map<ChannelId, unknown[]>();
  for (const entry of parsed.channels) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.channelId !== "string" || !Array.isArray(item.candidates)) continue;
    if (inputs.channels.some((channel) => channel.id === item.channelId)) {
      channels.set(item.channelId as ChannelId, item.candidates.slice(0, 10));
    }
  }
  for (const channel of inputs.channels) {
    if (!channels.has(channel.id)) throw new Error(`Gemini Full omitted ${channel.id}`);
  }
  return channels;
}

function rawDiscoveryBase(systemId: SystemId, channelId?: ChannelId, queryIndex?: number): string {
  const suffix = channelId ? `${channelId}/query-${String((queryIndex ?? 0) + 1).padStart(2, "0")}` : "all-channels";
  return path.join(rawRoot, "discovery", systemId, suffix);
}

async function runPreflight(): Promise<void> {
  const providers = benchmark.measuredSystems
    .map((system) => system.discoveryProvider)
    .filter((provider, index, all) => all.indexOf(provider) === index);
  const records: unknown[] = [];
  for (const providerId of providers) {
    console.log(`[preflight] ${providerId}`);
    const call = await measuredCall(path.join(rawRoot, "preflight", providerId), () =>
      createDiscoveryProvider(providerId, { timeoutMs: benchmark.preflight.timeoutMs }).search({
        query: benchmark.preflight.query,
        countryCode: benchmark.countryCode,
        countryName: benchmark.countryName,
        languageCode: benchmark.languageCode,
        maxResults: benchmark.preflight.maxResults,
      }));
    records.push({
      providerId,
      status: "succeeded",
      rawSha256: call.rawSha256,
      attempts: call.attempts,
      normalized: committedResult(call.result),
    });
  }
  await writeJson(path.join(artifactRoot, "preflight/provider-connectivity.json"), {
    schemaVersion: 1,
    runId: benchmark.execution.runId,
    completedAt: timestamp(),
    records,
  });
}

async function runDiscovery(): Promise<void> {
  for (const systemId of benchmark.execution.runOrder) {
    const system = benchmark.measuredSystems.find((entry) => entry.id === systemId);
    if (!system) throw new Error(`Missing measured system configuration: ${systemId}`);
    if (systemId === "gemini-full") {
      console.log("[discovery] gemini-full all channels");
      const call = await measuredCall(rawDiscoveryBase(systemId), () => runGeminiFullSearch(inputs.geminiFullPrompt, {
        countryCode: benchmark.countryCode,
        countryName: benchmark.countryName,
        languageCode: benchmark.languageCode,
        maxResults: 20,
      }, { timeoutMs: 180_000 }), (result) => { geminiChannels(result); });
      const parsedChannels = geminiChannels(call.result);
      for (const channel of inputs.channels) {
        await writeJson(path.join(artifactRoot, "discovery", systemId, `${channel.id}.json`), {
          schemaVersion: 1,
          runId: benchmark.execution.runId,
          systemId,
          mode: system.mode,
          channelId: channel.id,
          rawSha256: call.rawSha256,
          attempts: call.attempts,
          requestCount: 1,
          latencyMs: call.result.latencyMs,
          usage: call.result.usage,
          candidates: parsedChannels.get(channel.id),
          sourceUrls: committedResult(call.result).sourceUrls,
        });
      }
      continue;
    }

    const provider = createDiscoveryProvider(system.discoveryProvider, { timeoutMs: benchmark.execution.requestTimeoutMs });
    for (const channel of inputs.channels) {
      console.log(`[discovery] ${systemId} ${channel.id}`);
      const queryOutputs: Array<{ queryIndex: number; rawSha256: string; attempts: number; result: Omit<DiscoveryProviderResult, "rawResponse"> }> = [];
      for (let queryIndex = 0; queryIndex < channel.queries.length; queryIndex += 1) {
        const call = await measuredCall(rawDiscoveryBase(systemId, channel.id, queryIndex), () => provider.search({
          query: channel.queries[queryIndex],
          countryCode: benchmark.countryCode,
          countryName: benchmark.countryName,
          languageCode: benchmark.languageCode,
          maxResults: benchmark.execution.maxResultsPerQuery,
        }));
        queryOutputs.push({ queryIndex, rawSha256: call.rawSha256, attempts: call.attempts, result: committedResult(call.result) });
      }
      await writeJson(path.join(artifactRoot, "discovery", systemId, `${channel.id}.json`), {
        schemaVersion: 1,
        runId: benchmark.execution.runId,
        systemId,
        mode: system.mode,
        providerId: system.discoveryProvider,
        channelId: channel.id,
        queryOutputs,
        requestCount: queryOutputs.reduce((sum, output) => sum + output.result.requestCount, 0),
        latencyMs: queryOutputs.reduce((sum, output) => sum + output.result.latencyMs, 0),
        usage: queryOutputs.reduce<Record<string, number>>((usage, output) => {
          for (const [key, value] of Object.entries(output.result.usage ?? {})) usage[key] = (usage[key] ?? 0) + value;
          return usage;
        }, {}),
      });
    }
  }
}

async function discoveryResults(systemId: SystemId, channelId: ChannelId): Promise<DiscoveryProviderResult[]> {
  const system = benchmark.measuredSystems.find((entry) => entry.id === systemId);
  const channel = inputs.channels.find((entry) => entry.id === channelId);
  if (!system || !channel) throw new Error("Unknown system or channel");
  if (systemId === "gemini-full") {
    const record = await readJson<{ result: DiscoveryProviderResult }>(`${rawDiscoveryBase(systemId)}.result.json`);
    return [record.result];
  }
  return Promise.all(channel.queries.map(async (_, queryIndex) => {
    const record = await readJson<{ result: DiscoveryProviderResult }>(`${rawDiscoveryBase(systemId, channelId, queryIndex)}.result.json`);
    return record.result;
  }));
}

function committedEvaluation(value: EvaluatedChannel): Omit<EvaluatedChannel, "rawResponse"> {
  const { rawResponse: _rawResponse, ...committed } = value;
  return committed;
}

async function assertDiscoveryComplete(): Promise<void> {
  for (const system of benchmark.measuredSystems) {
    for (const channel of inputs.channels) await discoveryResults(system.id, channel.id);
  }
}

async function runEvaluation(): Promise<void> {
  await assertDiscoveryComplete();
  console.log("[evaluate] all measured discovery files are complete; downstream access is now enabled");
  const evaluated: Array<{ systemId: SystemId; channel: EvaluatedChannel }> = [];
  for (const systemId of benchmark.execution.runOrder) {
    for (const channel of inputs.channels) {
      console.log(`[evaluate] ${systemId} ${channel.id}`);
      const rawPath = path.join(rawRoot, "evaluation", systemId, channel.id);
      let result: EvaluatedChannel;
      try {
        const existing = await readJson<{ result: EvaluatedChannel }>(`${rawPath}.result.json`);
        result = existing.result;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const sourceResults = await discoveryResults(systemId, channel.id);
        const fixedCandidates = systemId === "gemini-full"
          ? geminiChannels(sourceResults[0]).get(channel.id) ?? [] : undefined;
        result = await evaluateChannel({
          channelId: channel.id,
          channelLabel: channel.label,
          eligibleRoles: channel.eligibleRoles,
          roleRules: inputs.compactRoleRules,
          cudyBrief: inputs.cudyBrief,
          commonBrief: inputs.commonDiscoveryBrief,
          configuration: inputs.downstreamEvaluator,
          discoveryItems: sourceResults.flatMap((source) => source.items),
          fixedCandidates,
        });
        await writeJson(`${rawPath}.result.json`, { completedAt: timestamp(), status: "succeeded", result });
      }
      const rawSha256 = sha256(await readFile(`${rawPath}.result.json`));
      await writeJson(path.join(artifactRoot, "evaluation", systemId, `${channel.id}.json`), {
        schemaVersion: 1,
        runId: benchmark.execution.runId,
        systemId,
        rawSha256,
        ...committedEvaluation(result),
      });
      evaluated.push({ systemId, channel: result });
    }
  }

  const systemScores = benchmark.execution.runOrder.map((systemId) => {
    const channels = inputs.channels.map((channel) => {
      const result = evaluated.find((entry) => entry.systemId === systemId && entry.channel.channelId === channel.id)?.channel;
      if (!result) throw new Error(`Missing evaluation ${systemId}/${channel.id}`);
      const scores = result.selectedCandidates.slice(0, 10).map((candidate) => candidate.score);
      const padded = [...scores, ...Array.from({ length: Math.max(0, 10 - scores.length) }, () => 0)].slice(0, 10);
      return {
        channelId: channel.id,
        submittedCandidates: result.selectedCandidates.length,
        validCandidates: result.selectedCandidates.filter((candidate) => candidate.score > 0).length,
        missingSlots: Math.max(0, 10 - result.selectedCandidates.length),
        slotScores: padded,
        channelQualityScore: padded.reduce((sum, score) => sum + score, 0) / 10,
        categoryPlacementAccuracy: result.selectedCandidates.length
          ? result.selectedCandidates.filter((candidate) => candidate.eligibility.submittedChannelRole).length / result.selectedCandidates.length : 0,
      };
    });
    return {
      systemId,
      channels,
      overallMacroQualityScore: channels.reduce((sum, channel) => sum + channel.channelQualityScore, 0) / channels.length,
    };
  });
  await writeJson(path.join(artifactRoot, "scoring/raw-system-scores.json"), {
    schemaVersion: 1,
    runId: benchmark.execution.runId,
    scoreStatus: "raw-model-score-before-human-calibration",
    formula: "productUseCaseFit*9 + cooperationPath*7 + evidenceReliability*4; failed and missing slots are zero",
    systemScores,
  });

  const resourceMetrics = [];
  for (const system of benchmark.measuredSystems) {
    const uniqueDiscoveryResults = system.id === "gemini-full"
      ? await discoveryResults(system.id, inputs.channels[0].id)
      : (await Promise.all(inputs.channels.map((channel) => discoveryResults(system.id, channel.id)))).flat();
    const evaluations = evaluated.filter((entry) => entry.systemId === system.id).map((entry) => entry.channel.evaluator);
    resourceMetrics.push({
      systemId: system.id,
      discoveryRequests: uniqueDiscoveryResults.reduce((sum, result) => sum + result.requestCount, 0),
      discoveryLatencyMs: uniqueDiscoveryResults.reduce((sum, result) => sum + result.latencyMs, 0),
      discoveryUsage: uniqueDiscoveryResults.reduce<Record<string, number>>((usage, result) => {
        for (const [key, value] of Object.entries(result.usage ?? {})) usage[key] = (usage[key] ?? 0) + value;
        return usage;
      }, {}),
      evaluatorRequests: evaluations.reduce((sum, value) => sum + value.requestCount, 0),
      evaluatorLatencyMs: evaluations.reduce((sum, value) => sum + value.latencyMs, 0),
      evaluatorInputTokens: evaluations.reduce((sum, value) => sum + (value.inputTokens ?? 0), 0),
      evaluatorOutputTokens: evaluations.reduce((sum, value) => sum + (value.outputTokens ?? 0), 0),
      providerReportedMonetaryCost: null,
    });
  }
  await writeJson(path.join(artifactRoot, "scoring/resource-metrics.json"), {
    schemaVersion: 1,
    runId: benchmark.execution.runId,
    note: "Provider-reported requests, latency, credits and tokens are recorded separately from quality. Monetary cost is null when APIs do not return it.",
    resourceMetrics,
  });
}

await mkdir(rawRoot, { recursive: true });
await mkdir(artifactRoot, { recursive: true });
if (phase === "preflight" || phase === "all") await runPreflight();
if (phase === "discovery" || phase === "all") await runDiscovery();
if (phase === "evaluate" || phase === "all") await runEvaluation();
console.log(JSON.stringify({ runId: benchmark.execution.runId, phase, status: "succeeded", completedAt: timestamp() }, null, 2));
