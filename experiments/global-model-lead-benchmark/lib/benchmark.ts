/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are validated at runtime */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ProviderId = "openai" | "claude" | "kimi" | "deepseek";
export type ProviderConfig = { enabled: boolean; participatesInCurrentRun: boolean; credentials: { apiKeyEnv: string; baseUrl?: string; baseUrlEnv?: string }; model: { modelId: string } };
type PilotConfig = { countryCode: string; countryName: string; regionName: string; primaryLanguages: string[]; promptFile: string; providers: ProviderId[]; limits: { nativeSearchRequests: number; visibleOutputTokens: number; continuationPages: number; timeoutMinutesPerProvider: number; automaticRetries: number }; storage: { rawResultsDirectory: string } };
export type RunContext = { providerId: ProviderId; provider: ProviderConfig; prompt: string; trigger: string; runDate: string; pilot: PilotConfig };
export type RunArtifact = { providerId: ProviderId; modelId: string; startedAt: string; completedAt: string; searchRequestsObserved: number; response: unknown; rawProviderResponse: unknown };

const experimentRoot = path.resolve("experiments/global-model-lead-benchmark");
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

export function buildBenchmarkTrigger(countryName: string, countryCode: string, primaryLanguages: string[]): string {
  return `Begin the ${countryName} (${countryCode}) benchmark. Search in ${primaryLanguages.join(" and ")} for Cudy's current channel partners and qualified tier-1 distributors, importers, wholesalers, operator or enterprise SIs, plus important downstream VARs, ISPs, retailers, and public business contacts. Follow the system schema and return only JSON.`;
}

export function buildMessageEnvelope(providerId: ProviderId, prompt: string, trigger: string): { instructions?: string; input?: string; system?: string; messages?: Array<{ role: string; content: string }> } {
  if (providerId === "openai") return { instructions: prompt, input: trigger };
  if (providerId === "kimi") return { messages: [{ role: "system", content: prompt }, { role: "user", content: trigger }] };
  return { system: prompt, messages: [{ role: "user", content: trigger }] };
}

export function anthropicMessagesUrl(providerId: ProviderId, baseUrl: string): string {
  return providerId === "deepseek" ? `${baseUrl}/anthropic/v1/messages` : `${baseUrl}/v1/messages`;
}

export async function loadContext(providerId: ProviderId, runDate = new Date().toISOString().slice(0, 10)): Promise<RunContext> {
  const pilot = await readJson<PilotConfig>(path.join(experimentRoot, "config/pilot.json"));
  const document = await readJson<{ providers: Record<string, ProviderConfig> }>(path.join(experimentRoot, "config/providers.json"));
  const provider = document.providers[providerId];
  if (!pilot.providers.includes(providerId) || !provider?.enabled || !provider.participatesInCurrentRun) throw new Error(`${providerId} is not enabled for the confirmed pilot`);
  const template = await readFile(path.join(experimentRoot, pilot.promptFile), "utf8");
  const values: Record<string, string> = { COUNTRY_NAME: pilot.countryName, COUNTRY_CODE: pilot.countryCode, REGION_NAME: pilot.regionName, PRIMARY_LANGUAGES: pilot.primaryLanguages.join(", "), RUN_DATE: runDate };
  const prompt = template.replace(/\{([A-Z_]+)\}/g, (match, key: string) => values[key] ?? match);
  const unresolved = [...prompt.matchAll(/\{([A-Z_]+)\}/g)].map((match) => match[0]);
  if (unresolved.length) throw new Error(`Unresolved prompt placeholders: ${[...new Set(unresolved)].join(", ")}`);
  const trigger = buildBenchmarkTrigger(pilot.countryName, pilot.countryCode, pilot.primaryLanguages);
  return { providerId, provider, prompt, trigger, runDate, pilot };
}

function credentials(provider: ProviderConfig): { apiKey: string; baseUrl: string } {
  const apiKey = process.env[provider.credentials.apiKeyEnv]?.trim();
  const baseUrl = (provider.credentials.baseUrl ?? process.env[provider.credentials.baseUrlEnv ?? ""] ?? "").trim().replace(/\/$/, "");
  if (!apiKey || !baseUrl) throw new Error(`Missing ${provider.credentials.apiKeyEnv} or provider base URL`);
  return { apiKey, baseUrl };
}

async function requestJson(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${body.slice(0, 500)}`);
  return JSON.parse(body);
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
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Provider stream failed (${response.status}): ${body.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("Provider stream has no response body");
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
    if (done) break;
  }
  if (buffer.trim()) {
    const parsed = parseSseBuffer(`${buffer}\n\n`);
    events.push(...parsed.events);
  }
  return events;
}

function isBenchmarkObject(value: any): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.runMetadata && value.searchCapability && Array.isArray(value.tier1Partners));
}

export function extractBenchmarkJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  try {
    const direct = JSON.parse(trimmed) as unknown;
    if (isBenchmarkObject(direct)) return direct;
  } catch {
    // Continue with balanced-object extraction for provider-added prose.
  }

  const candidates: unknown[] = [];
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
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const value = JSON.parse(text.slice(start, index + 1)) as unknown;
          if (isBenchmarkObject(value)) candidates.push(value);
        } catch {
          // A balanced brace block can still be non-JSON prose.
        }
        start = -1;
      }
    }
  }
  if (candidates.length !== 1) throw new Error(`Expected exactly one complete benchmark JSON object, found ${candidates.length}`);
  return candidates[0];
}

async function runOpenAi(context: RunContext) {
  const { apiKey, baseUrl } = credentials(context.provider);
  const envelope = buildMessageEnvelope("openai", context.prompt, context.trigger);
  const events = await requestSse(`${baseUrl}/responses`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, accept: "text/event-stream", "content-type": "application/json" }, body: JSON.stringify({ model: context.provider.model.modelId, ...envelope, tools: [{ type: "web_search" }], include: ["web_search_call.action.sources"], max_output_tokens: context.pilot.limits.visibleOutputTokens, stream: true }) }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
  const failed = events.find((event) => event.type === "response.failed" || event.type === "error");
  if (failed) throw new Error(`OpenAI stream failed: ${JSON.stringify(failed).slice(0, 500)}`);
  const completed = events.findLast((event) => event.type === "response.completed")?.response;
  if (!completed) throw new Error("OpenAI stream ended without response.completed");
  const raw = completed;
  const text = (raw.output ?? []).flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("");
  const searches = events.filter((event) => event.type === "response.web_search_call.completed").length;
  return { text, searches, raw: { response: raw, streamEventTypes: events.map((event) => event.type) } };
}

async function runAnthropic(context: RunContext) {
  const { apiKey, baseUrl } = credentials(context.provider);
  const envelope = buildMessageEnvelope(context.providerId, context.prompt, context.trigger);
  const raw = await requestJson(anthropicMessagesUrl(context.providerId, baseUrl), { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: context.provider.model.modelId, max_tokens: context.pilot.limits.visibleOutputTokens, ...envelope, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: context.pilot.limits.nativeSearchRequests }] }) }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
  const text = (raw.content ?? []).filter((item: any) => item.type === "text").map((item: any) => item.text).join("");
  return { text, searches: (raw.content ?? []).filter((item: any) => item.type === "server_tool_use" && item.name === "web_search").length, raw };
}

export function buildKimiRequest(context: RunContext, messages: any[]) {
  return {
    model: context.provider.model.modelId,
    max_completion_tokens: context.pilot.limits.visibleOutputTokens,
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    messages,
    tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
  };
}

async function runKimi(context: RunContext) {
  const { apiKey, baseUrl } = credentials(context.provider);
  const envelope = buildMessageEnvelope("kimi", context.prompt, context.trigger);
  const messages: any[] = structuredClone(envelope.messages ?? []);
  const rounds: unknown[] = [];
  let searches = 0;
  let text = "";
  for (let round = 0; round <= context.pilot.limits.nativeSearchRequests; round += 1) {
    const raw = await requestJson(`${baseUrl}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(buildKimiRequest(context, messages)) }, context.pilot.limits.timeoutMinutesPerProvider * 60_000);
    rounds.push(raw);
    const choice = raw.choices?.[0];
    if (!choice) throw new Error("Kimi response has no choice");
    messages.push(choice.message);
    if (choice.finish_reason !== "tool_calls") { text = choice.message.content ?? ""; break; }
    for (const toolCall of choice.message.tool_calls ?? []) {
      searches += 1;
      if (searches > context.pilot.limits.nativeSearchRequests) throw new Error("Kimi exceeded native search request limit");
      messages.push({ role: "tool", tool_call_id: toolCall.id, name: toolCall.function.name, content: toolCall.function.arguments });
    }
  }
  if (!text) throw new Error("Kimi did not produce a final response within the search limit");
  return { text, searches, raw: rounds };
}

export function validateBenchmarkResult(value: any, context: RunContext): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Result is not one JSON object");
  for (const key of ["runMetadata", "searchCapability", "tier1Partners", "downstreamCustomers", "contacts", "continuation", "summaryMetrics"]) if (!(key in value)) throw new Error(`Missing required result field: ${key}`);
  if (value.runMetadata.countryCode !== context.pilot.countryCode || value.runMetadata.countryName !== context.pilot.countryName) throw new Error("Result country does not match pilot");
  if (![value.tier1Partners, value.downstreamCustomers, value.contacts].every(Array.isArray)) throw new Error("Candidate and contact fields must be arrays");
  const companies = [...value.tier1Partners, ...value.downstreamCustomers];
  const expected: Record<string, number> = {
    tier1PartnerCount: value.tier1Partners.length,
    tier1ConfirmedCurrentCount: value.tier1Partners.filter((item: any) => item.cudyRelationship === "confirmed_current").length,
    downstreamCustomerCount: value.downstreamCustomers.length,
    downstreamConfirmedCudyCount: value.downstreamCustomers.filter((item: any) => item.cudyLinkage === "confirmed_carries_cudy").length,
    contactCount: value.contacts.length,
    publicVerifiedContactCount: value.contacts.filter((item: any) => item.verificationStatus === "public_verified").length,
    uniqueCompanyCount: new Set(companies.map((item: any) => item.dedupKey)).size,
    uniqueDomainCount: new Set(companies.map((item: any) => item.domain).filter(Boolean)).size,
    queriesExecutedCount: value.searchCapability.queriesExecutedCount,
  };
  for (const [key, count] of Object.entries(expected)) if (value.summaryMetrics[key] !== count) throw new Error(`Metric ${key} is ${value.summaryMetrics[key]}, expected ${count}`);
  for (const company of companies) if (!Array.isArray(company.evidence) || company.evidence.length === 0) throw new Error(`Company lacks evidence: ${company.companyName ?? "unknown"}`);
  for (const contact of value.contacts) if (!Array.isArray(contact.evidence) || contact.evidence.length === 0) throw new Error(`Contact lacks evidence: ${contact.fullName ?? "unknown"}`);
}

export async function executeProvider(providerId: ProviderId): Promise<RunArtifact> {
  const context = await loadContext(providerId);
  const startedAt = new Date().toISOString();
  const result = providerId === "openai" ? await runOpenAi(context) : providerId === "kimi" ? await runKimi(context) : await runAnthropic(context);
  if (result.searches > context.pilot.limits.nativeSearchRequests) throw new Error(`${providerId} exceeded native search request limit`);
  const outputDirectory = path.join(experimentRoot, context.pilot.storage.rawResultsDirectory);
  await mkdir(outputDirectory, { recursive: true });
  let response: unknown;
  try {
    response = extractBenchmarkJson(result.text);
    validateBenchmarkResult(response, context);
  } catch (error) {
    const rejected = {
      status: "rejected",
      providerId,
      modelId: context.provider.model.modelId,
      startedAt,
      completedAt: new Date().toISOString(),
      searchRequestsObserved: result.searches,
      validationError: error instanceof Error ? error.message : String(error),
      rawText: result.text,
      rawProviderResponse: result.raw,
    };
    await writeFile(path.join(outputDirectory, `${context.runDate}-${context.pilot.countryCode}-${providerId}.rejected.json`), JSON.stringify(rejected, null, 2), "utf8");
    throw error;
  }
  const artifact: RunArtifact = { providerId, modelId: context.provider.model.modelId, startedAt, completedAt: new Date().toISOString(), searchRequestsObserved: result.searches, response, rawProviderResponse: result.raw };
  await writeFile(path.join(outputDirectory, `${context.runDate}-${context.pilot.countryCode}-${providerId}.json`), JSON.stringify(artifact, null, 2), "utf8");
  return artifact;
}
