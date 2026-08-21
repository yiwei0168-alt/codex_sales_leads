/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are retained for audit */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ProviderId = "openai" | "claude" | "kimi" | "deepseek" | "grok" | "gemini";
export type ProviderConfig = {
  enabled: boolean;
  participatesInCurrentRun: boolean;
  credentials: { apiKeyEnv: string; baseUrl?: string; baseUrlEnv?: string };
  model: { modelId: string };
};

export type PilotConfig = {
  protocolVersion: string;
  artifactTag: string;
  countryCode: string;
  countryName: string;
  regionName: string;
  primaryLanguages: string[];
  promptFile: string;
  providers: ProviderId[];
  repetitionsPerSystem: number;
  productComparator: {
    id: "sales-lead-copilot";
    enabled: boolean;
    sameUserPrompt: boolean;
    nativeSearchRestrictionApplies: false;
    sameTimeoutMinutes: number;
    samePrimaryCompanyCutoff: number;
    repetitionsPerSystem: number;
    resourceUseMustBeReported: string[];
  };
  limits: {
    nativeSearchActionsTargetBudget: number;
    visibleOutputTokens: number;
    timeoutMinutesPerProvider: number;
    automaticRetries: number;
    primaryCompanyCutoff: number;
  };
  judging: {
    humanReviewers: number;
    codexReviewsAllCandidates: boolean;
    blindHumanAuditPercent: number;
    blindHumanAuditMinimum: number;
    highRiskSupplementMaximumPercent: number;
    failedAuditExpansionPercent: number;
  };
  storage: { rawResultsDirectory: string; commitRawResults: boolean };
};

export type RunContext = {
  providerId: ProviderId;
  provider: ProviderConfig;
  prompt: string;
  runDate: string;
  repetition: number;
  pilot: PilotConfig;
};

export type PilotPromptContext = {
  prompt: string;
  runDate: string;
  pilot: PilotConfig;
};

export type RunArtifact = {
  protocolVersion: string;
  providerId: ProviderId;
  modelId: string;
  countryCode: string;
  repetition: number;
  attempt: number;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  searchRequestsObserved: number | null;
  nativeSearchEvidence: "observed" | "not_observed" | "unavailable";
  scoringEligibility: "eligible" | "zero_score_no_native_search";
  sourceUrls: string[];
  answerText: string;
  rawProviderResponse: unknown;
};

type ProviderResult = { text: string; searches: number | null; raw: unknown };

const experimentRoot = path.resolve("experiments/global-model-lead-benchmark");
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

export function buildMessageEnvelope(providerId: ProviderId, prompt: string): {
  input?: string;
  messages?: Array<{ role: "user"; content: string }>;
} {
  if (providerId === "openai" || providerId === "grok" || providerId === "gemini") return { input: prompt };
  return { messages: [{ role: "user", content: prompt }] };
}

export function geminiInteractionsUrl(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/+$/, "");
  normalized = normalized.replace(/\/openai(?:\/v1)?$/i, "");
  if (!/\/v1(?:beta)?$/i.test(normalized)) normalized = `${normalized}/v1beta`;
  return `${normalized}/interactions`;
}

export function anthropicMessagesUrl(providerId: ProviderId, baseUrl: string): string {
  return providerId === "deepseek" ? `${baseUrl}/anthropic/v1/messages` : `${baseUrl}/v1/messages`;
}

export async function loadContext(
  providerId: ProviderId,
  runDate = new Date().toISOString().slice(0, 10),
  repetition = 1,
): Promise<RunContext> {
  const { pilot, prompt } = await loadPilotPrompt(runDate);
  const document = await readJson<{ providers: Record<string, ProviderConfig> }>(path.join(experimentRoot, "config/providers.json"));
  const provider = document.providers[providerId];
  if (!pilot.providers.includes(providerId) || !provider?.enabled || !provider.participatesInCurrentRun) {
    throw new Error(`${providerId} is not enabled for the confirmed pilot`);
  }
  if (!Number.isInteger(repetition) || repetition < 1 || repetition > pilot.repetitionsPerSystem) {
    throw new Error(`Repetition must be between 1 and ${pilot.repetitionsPerSystem}`);
  }
  return { providerId, provider, prompt, runDate, repetition, pilot };
}

export async function loadPilotPrompt(
  runDate = new Date().toISOString().slice(0, 10),
): Promise<PilotPromptContext> {
  const pilot = await readJson<PilotConfig>(path.join(experimentRoot, "config/pilot.json"));
  const template = await readFile(path.join(experimentRoot, pilot.promptFile), "utf8");
  const values: Record<string, string> = {
    COUNTRY_NAME: pilot.countryName,
    COUNTRY_CODE: pilot.countryCode,
    REGION_NAME: pilot.regionName,
    PRIMARY_LANGUAGES: pilot.primaryLanguages.join("、"),
    RUN_DATE: runDate,
  };
  const prompt = template.replace(/\{([A-Z_]+)\}/g, (match, key: string) => values[key] ?? match).trim();
  const unresolved = [...prompt.matchAll(/\{([A-Z_]+)\}/g)].map((match) => match[0]);
  if (unresolved.length) throw new Error(`Unresolved prompt placeholders: ${[...new Set(unresolved)].join(", ")}`);
  return { prompt, runDate, pilot };
}

export function environmentValue(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  const caseInsensitive = Object.entries(process.env)
    .find(([key, value]) => key.toLowerCase() === name.toLowerCase() && value?.trim())?.[1];
  return caseInsensitive?.trim();
}

export function providerCredentials(provider: ProviderConfig): { apiKey: string; baseUrl: string } {
  const apiKey = environmentValue(provider.credentials.apiKeyEnv);
  const baseUrl = (provider.credentials.baseUrl ?? environmentValue(provider.credentials.baseUrlEnv) ?? "").trim().replace(/\/$/, "");
  if (!apiKey || !baseUrl) throw new Error(`Missing ${provider.credentials.apiKeyEnv} or provider base URL`);
  return { apiKey, baseUrl };
}

async function requestJson(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${body.slice(0, 500)}`);
  try { return JSON.parse(body); } catch { throw new Error(`Provider returned non-JSON transport payload: ${body.slice(0, 300)}`); }
}

export function parseSseBuffer(buffer: string): { events: any[]; remainder: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events = blocks.flatMap((block) => {
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return [];
    return [JSON.parse(data)];
  });
  return { events, remainder };
}

async function requestSse(url: string, init: RequestInit, timeoutMs: number): Promise<any[]> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Provider stream failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  if (!response.body) throw new Error("Provider stream has no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: any[] = [];
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parsed = parseSseBuffer(buffer);
      events.push(...parsed.events);
      buffer = parsed.remainder;
      if (done) break;
    }
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      partialEventTypes: events.map((event) => event.type).slice(-100),
    });
  }
  if (buffer.trim()) events.push(...parseSseBuffer(`${buffer}\n\n`).events);
  return events;
}

function responseOutputText(response: any): string {
  return (response.output ?? []).flatMap((item: any) => item.content ?? [])
    .filter((item: any) => item.type === "output_text")
    .map((item: any) => item.text).join("");
}

function countResponseWebSearchCalls(events: any[], response: any): number {
  const completedEvents = events.filter((event) => event.type === "response.web_search_call.completed").length;
  const outputItems = (response.output ?? []).filter((item: any) => item.type === "web_search_call").length;
  return Math.max(completedEvents, outputItems);
}

function completedResponse(events: any[], provider: string): any {
  const failed = events.find((event) => event.type === "response.failed" || event.type === "error");
  if (failed) throw new Error(`${provider} response failed: ${JSON.stringify(failed).slice(0, 500)}`);
  const completed = events.findLast((event) => event.type === "response.completed")?.response;
  if (!completed) throw new Error(`${provider} stream ended without response.completed`);
  return completed;
}

export function collectSourceUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      for (const match of item.matchAll(/https?:\/\/[^\s<>()\]"']+/g)) {
        try {
          const url = new URL(match[0].replace(/[.,;:!?，。；：！？）】]+$/, ""));
          if (url.protocol === "http:" || url.protocol === "https:") urls.add(url.toString());
        } catch { /* Ignore malformed URLs. */ }
      }
      return;
    }
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (item && typeof item === "object") Object.values(item as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return [...urls].sort();
}

export function buildOpenAiRequest(context: RunContext) {
  return {
    model: context.provider.model.modelId,
    ...buildMessageEnvelope("openai", context.prompt),
    tools: [{ type: "web_search" }],
    max_output_tokens: context.pilot.limits.visibleOutputTokens,
    reasoning: { effort: "none" },
    text: { verbosity: "medium" },
    stream: true,
  };
}

async function runOpenAi(context: RunContext): Promise<ProviderResult> {
  const { apiKey, baseUrl } = providerCredentials(context.provider);
  const events = await requestSse(`${baseUrl}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream", "content-type": "application/json" },
    body: JSON.stringify(buildOpenAiRequest(context)),
  }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
  const response = completedResponse(events, "OpenAI");
  return {
    text: responseOutputText(response),
    searches: countResponseWebSearchCalls(events, response),
    raw: { response, streamEventTypes: events.map((event) => event.type) },
  };
}

export function buildGrokRequest(context: RunContext) {
  return {
    model: context.provider.model.modelId,
    ...buildMessageEnvelope("grok", context.prompt),
    tools: [{ type: "web_search" }],
    max_turns: context.pilot.limits.nativeSearchActionsTargetBudget,
    max_output_tokens: context.pilot.limits.visibleOutputTokens,
    reasoning: { effort: "none" },
    parallel_tool_calls: false,
    store: true,
    stream: true,
  };
}

async function runGrok(context: RunContext): Promise<ProviderResult> {
  const { apiKey, baseUrl } = providerCredentials(context.provider);
  const events = await requestSse(`${baseUrl}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream", "content-type": "application/json" },
    body: JSON.stringify(buildGrokRequest(context)),
  }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
  const response = completedResponse(events, "Grok");
  return {
    text: responseOutputText(response),
    searches: countResponseWebSearchCalls(events, response),
    raw: { response, streamEventTypes: events.map((event) => event.type) },
  };
}

export function buildAnthropicRequest(context: RunContext) {
  return {
    model: context.provider.model.modelId,
    max_tokens: context.pilot.limits.visibleOutputTokens,
    ...buildMessageEnvelope(context.providerId, context.prompt),
    ...(context.providerId === "deepseek" ? { thinking: { type: "disabled" } } : {}),
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: context.pilot.limits.nativeSearchActionsTargetBudget }],
  };
}

async function runAnthropic(context: RunContext): Promise<ProviderResult> {
  const { apiKey, baseUrl } = providerCredentials(context.provider);
  const raw = await requestJson(anthropicMessagesUrl(context.providerId, baseUrl), {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(buildAnthropicRequest(context)),
  }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
  const searches = Number(raw.usage?.server_tool_use?.web_search_requests
    ?? (raw.content ?? []).filter((item: any) => item.type === "server_tool_use" && item.name === "web_search").length);
  return {
    text: (raw.content ?? []).filter((item: any) => item.type === "text").map((item: any) => item.text).join(""),
    searches: Number.isFinite(searches) ? searches : null,
    raw,
  };
}

export function buildKimiRequest(context: RunContext, messages: any[]) {
  return {
    model: context.provider.model.modelId,
    max_completion_tokens: context.pilot.limits.visibleOutputTokens,
    thinking: { type: "disabled" },
    messages,
    tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
  };
}

async function runKimi(context: RunContext): Promise<ProviderResult> {
  const { apiKey, baseUrl } = providerCredentials(context.provider);
  const messages: any[] = structuredClone(buildMessageEnvelope("kimi", context.prompt).messages ?? []);
  const rounds: unknown[] = [];
  const deadline = Date.now() + context.pilot.limits.timeoutMinutesPerProvider * 60_000;
  const remainingTimeout = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Kimi run exceeded the provider timeout");
    return remaining;
  };
  let searches = 0;
  let text = "";
  while (true) {
    const raw = await requestJson(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(buildKimiRequest(context, messages)),
    }, remainingTimeout());
    rounds.push(raw);
    const choice = raw.choices?.[0];
    if (!choice) throw new Error("Kimi response has no choice");
    messages.push(choice.message);
    if (choice.finish_reason !== "tool_calls") { text = choice.message.content ?? ""; break; }
    for (const toolCall of choice.message.tool_calls ?? []) {
      searches += 1;
      messages.push({ role: "tool", tool_call_id: toolCall.id, name: toolCall.function.name, content: toolCall.function.arguments });
    }
  }
  if (!text.trim()) throw new Error("Kimi did not produce a final natural-language response within the search ceiling");
  return { text, searches, raw: rounds };
}

export function buildGeminiRequest(
  context: RunContext,
  prompt = context.prompt,
  withSearch = true,
  maxOutputTokens = context.pilot.limits.visibleOutputTokens,
) {
  return {
    model: context.provider.model.modelId,
    input: prompt,
    ...(withSearch ? { tools: [{ type: "google_search" }] } : {}),
    generation_config: {
      thinking_level: "low",
      max_output_tokens: maxOutputTokens,
    },
  };
}

export function geminiInteractionText(response: any): string {
  return (response.steps ?? [])
    .filter((step: any) => step.type === "model_output")
    .flatMap((step: any) => step.content ?? [])
    .filter((content: any) => content.type === "text")
    .map((content: any) => content.text ?? "")
    .join("");
}

export function countGeminiSearchQueries(response: any): number {
  const searchCalls = (response.steps ?? []).filter((step: any) => step.type === "google_search_call");
  const queries = new Set(searchCalls.flatMap((step: any) => step.arguments?.queries ?? [])
    .filter((query: unknown): query is string => typeof query === "string" && query.trim().length > 0)
    .map((query: string) => query.trim()));
  return queries.size || searchCalls.length;
}

async function runGemini(context: RunContext): Promise<ProviderResult> {
  const { apiKey, baseUrl } = providerCredentials(context.provider);
  const raw = await requestJson(geminiInteractionsUrl(baseUrl), {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(buildGeminiRequest(context)),
  }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
  return {
    text: geminiInteractionText(raw),
    searches: countGeminiSearchQueries(raw),
    raw,
  };
}

function validateNaturalAnswer(result: ProviderResult, context: RunContext): void {
  if (!result.text.trim()) throw new Error(`${context.providerId} returned an empty natural-language answer`);
}

function failureDetail(error: unknown): Record<string, unknown> {
  const value = error as Error & { partialEventTypes?: string[] };
  return {
    name: value?.name ?? "Error",
    message: value?.message ?? String(error),
    ...(value?.partialEventTypes ? { partialEventTypes: value.partialEventTypes } : {}),
  };
}

async function assertArtifactPathsAvailable(paths: string[]): Promise<void> {
  for (const file of paths) {
    try {
      await access(file);
      throw new Error(`Refusing to overwrite an existing benchmark artifact: ${file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function executeProvider(providerId: ProviderId, repetition = 1, attempt = 1): Promise<RunArtifact> {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("Attempt must be a positive integer");
  const context = await loadContext(providerId, undefined, repetition);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const outputDirectory = path.join(experimentRoot, context.pilot.storage.rawResultsDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const attemptSuffix = attempt === 1 ? "" : `-a${attempt}`;
  const baseName = `${context.runDate}-${context.pilot.countryCode}-${context.pilot.artifactTag}-${providerId}-r${repetition}${attemptSuffix}`;
  const successPath = path.join(outputDirectory, `${baseName}.json`);
  const failurePath = path.join(outputDirectory, `${baseName}.failed.json`);
  await assertArtifactPathsAvailable([successPath, failurePath]);
  try {
    const result = providerId === "openai" ? await runOpenAi(context)
      : providerId === "grok" ? await runGrok(context)
        : providerId === "kimi" ? await runKimi(context)
          : providerId === "gemini" ? await runGemini(context)
            : await runAnthropic(context);
    validateNaturalAnswer(result, context);
    const sourceUrls = collectSourceUrls([result.text, result.raw]);
    const nativeSearchEvidence = result.searches === null
      ? "unavailable"
      : (result.searches > 0 ? "observed" : "not_observed");
    const scoringEligibility = nativeSearchEvidence === "observed" ? "eligible" : "zero_score_no_native_search";
    const artifact: RunArtifact = {
      protocolVersion: context.pilot.protocolVersion,
      providerId,
      modelId: context.provider.model.modelId,
      countryCode: context.pilot.countryCode,
      repetition,
      attempt,
      startedAt,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedMs,
      searchRequestsObserved: result.searches,
      nativeSearchEvidence,
      scoringEligibility,
      sourceUrls,
      answerText: result.text,
      rawProviderResponse: result.raw,
    };
    await writeFile(successPath, JSON.stringify(artifact, null, 2), { encoding: "utf8", flag: "wx" });
    return artifact;
  } catch (error) {
    const failure = {
      protocolVersion: context.pilot.protocolVersion,
      status: "infrastructure_or_protocol_failure",
      providerId,
      modelId: context.provider.model.modelId,
      countryCode: context.pilot.countryCode,
      repetition,
      attempt,
      startedAt,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedMs,
      automaticRetries: context.pilot.limits.automaticRetries,
      error: failureDetail(error),
    };
    await writeFile(failurePath, JSON.stringify(failure, null, 2), { encoding: "utf8", flag: "wx" });
    throw error;
  }
}
