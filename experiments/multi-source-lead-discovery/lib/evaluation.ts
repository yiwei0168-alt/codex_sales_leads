import type { DiscoveryItem } from "./contracts";

export type ChannelId = "tier1-distribution" | "b2b-resale" | "project-services";

export interface EligibilityGates {
  companyExists: boolean;
  germanyPresence: boolean;
  networkingRelevant: boolean;
  submittedChannelRole: boolean;
  sufficientEvidence: boolean;
  uniqueWithinList: boolean;
}

export interface ScoreLevels {
  productUseCaseFit: number;
  cooperationPath: number;
  evidenceReliability: number;
}

export interface EvidenceItem {
  url: string;
  excerpt: string;
}

export interface EvaluatedCandidate {
  companyName: string;
  officialUrl: string | null;
  roles: string[];
  eligibility: EligibilityGates;
  levels: ScoreLevels;
  score: number;
  roleEvidence: string;
  productFitEvidence: string;
  cooperationEvidence: string;
  evidenceItems: EvidenceItem[];
  rationale: string;
}

export interface EvaluatedChannel {
  channelId: ChannelId;
  selectedCandidates: EvaluatedCandidate[];
  rejectedItems: Array<{ title: string; url: string | null; reason: string }>;
  evaluator: {
    requestedModel: string;
    returnedModel: string;
    requestCount: number;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  rawResponse: unknown;
}

interface EvaluatorConfiguration {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  systemPrompt: string;
  taskPrompt: string;
  fixedListEvaluationPrompt: string;
}

interface ClaudeResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function messagesUrl(): string {
  const parsed = new URL(process.env.CLAUDE_BASE_URL?.trim() || "https://api.anthropic.com");
  if (parsed.protocol !== "https:" || !["api.anthropic.com", "lingyuapi.com"].includes(parsed.hostname)
    || parsed.username || parsed.password) {
    throw new Error("CLAUDE_BASE_URL is not a trusted Anthropic-compatible HTTPS endpoint");
  }
  const base = parsed.toString().replace(/\/$/, "");
  return /\/v1$/i.test(base) ? `${base}/messages` : `${base}/v1/messages`;
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Evaluator did not return a JSON object");
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function levelValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.round(numeric)));
}

export function candidateScore(levels: ScoreLevels): number {
  return levels.productUseCaseFit * 9 + levels.cooperationPath * 7 + levels.evidenceReliability * 4;
}

export function passesAllGates(gates: EligibilityGates): boolean {
  return Object.values(gates).every(Boolean);
}

export function sanitizeText(value: string): string {
  return value
    .replace(/(?:^|\s)#{1,6}\s*Workforce\b[\s\S]*$/i, " [redacted-workforce-section]")
    .replace(/(?:-|#{1,6})\s*Key Executives?\s*:[\s\S]*?(?=(?:-|#{1,6})\s*(?:Breakdown|Workforce|Company Details)\b|$)/gi,
      " [redacted-personnel-section] ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?\d[\d\s()./-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsefulPublicUrl(value: string | null): boolean {
  const url = canonicalPublicUrl(value);
  if (!url) return false;
  const parsed = new URL(url);
  if (/^(?:www\.)?w3\.org$/i.test(parsed.hostname) && /\/(?:2000\/svg|1999\/xhtml)/i.test(parsed.pathname)) return false;
  if (/^(?:www\.)?google\.[a-z.]+$/i.test(parsed.hostname) && parsed.pathname === "/search") return false;
  return true;
}

export function canonicalPublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|ved$|ei$|sa$|source$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseCandidate(value: unknown): EvaluatedCandidate {
  const candidate = objectValue(value);
  const gateInput = objectValue(candidate.eligibility ?? {});
  const eligibility: EligibilityGates = {
    companyExists: booleanValue(gateInput.companyExists),
    germanyPresence: booleanValue(gateInput.germanyPresence),
    networkingRelevant: booleanValue(gateInput.networkingRelevant),
    submittedChannelRole: booleanValue(gateInput.submittedChannelRole),
    sufficientEvidence: booleanValue(gateInput.sufficientEvidence),
    uniqueWithinList: booleanValue(gateInput.uniqueWithinList),
  };
  const levelInput = objectValue(candidate.levels ?? {});
  const levels: ScoreLevels = {
    productUseCaseFit: levelValue(levelInput.productUseCaseFit),
    cooperationPath: levelValue(levelInput.cooperationPath),
    evidenceReliability: levelValue(levelInput.evidenceReliability),
  };
  const evidenceItems = Array.isArray(candidate.evidenceItems) ? candidate.evidenceItems.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const evidence = entry as Record<string, unknown>;
    const url = canonicalPublicUrl(evidence.url);
    const excerpt = sanitizeText(stringValue(evidence.excerpt)).slice(0, 1_000);
    return url && excerpt ? [{ url, excerpt }] : [];
  }) : [];
  const score = passesAllGates(eligibility) ? candidateScore(levels) : 0;
  return {
    companyName: sanitizeText(stringValue(candidate.companyName, "Unnamed company")).slice(0, 200),
    officialUrl: canonicalPublicUrl(candidate.officialUrl),
    roles: Array.isArray(candidate.roles)
      ? [...new Set(candidate.roles.map((role) => sanitizeText(stringValue(role))).filter(Boolean))].slice(0, 8) : [],
    eligibility,
    levels,
    score,
    roleEvidence: sanitizeText(stringValue(candidate.roleEvidence)).slice(0, 2_000),
    productFitEvidence: sanitizeText(stringValue(candidate.productFitEvidence)).slice(0, 2_000),
    cooperationEvidence: sanitizeText(stringValue(candidate.cooperationEvidence)).slice(0, 2_000),
    evidenceItems: [...new Map(evidenceItems.map((entry) => [entry.url, entry])).values()].slice(0, 8),
    rationale: sanitizeText(stringValue(candidate.rationale)).slice(0, 2_000),
  };
}

function evaluatorSchema(): Record<string, unknown> {
  return {
    selectedCandidates: [{
      companyName: "string",
      officialUrl: "official company URL or null",
      roles: ["verified role"],
      eligibility: {
        companyExists: "boolean", germanyPresence: "boolean", networkingRelevant: "boolean",
        submittedChannelRole: "boolean", sufficientEvidence: "boolean", uniqueWithinList: "boolean",
      },
      levels: { productUseCaseFit: "integer 0-5", cooperationPath: "integer 0-5", evidenceReliability: "integer 0-5" },
      roleEvidence: "concise evidence-grounded explanation",
      productFitEvidence: "concise evidence-grounded explanation",
      cooperationEvidence: "concise evidence-grounded explanation",
      evidenceItems: [{ url: "supplied public URL", excerpt: "exact or minimally cleaned supplied excerpt" }],
      rationale: "concise score rationale",
    }],
    rejectedItems: [{ title: "string", url: "URL or null", reason: "string" }],
  };
}

async function invokeClaude(
  configuration: EvaluatorConfiguration,
  userPayload: Record<string, unknown>,
  fetchImplementation: typeof fetch,
): Promise<{ parsed: Record<string, unknown>; response: ClaudeResponse; latencyMs: number }> {
  const apiKey = process.env.CLAUDE_API_KEY?.trim();
  if (!apiKey) throw new Error("CLAUDE_API_KEY is not configured for benchmark evaluation");
  const startedAt = Date.now();
  const response = await fetchImplementation(messagesUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "anthropic-version": process.env.CLAUDE_API_VERSION?.trim() || "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: configuration.model,
      max_tokens: configuration.maxOutputTokens,
      temperature: configuration.temperature,
      system: configuration.systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const body = await response.json() as ClaudeResponse;
  if (!response.ok) throw new Error(body.error?.message ?? `Claude evaluator HTTP ${response.status}`);
  const text = (body.content ?? []).filter((item) => item.type === "text")
    .map((item) => item.text ?? "").join("\n").trim();
  if (!text) throw new Error("Claude evaluator returned an empty response");
  return { parsed: objectValue(parseJsonObject(text)), response: body, latencyMs: Date.now() - startedAt };
}

function compactItems(items: DiscoveryItem[]): Array<Record<string, unknown>> {
  return items.map((item) => ({
    title: sanitizeText(item.title).slice(0, 300),
    url: canonicalPublicUrl(item.url),
    snippet: sanitizeText(item.snippet).slice(0, 1_200),
    providerRank: item.rank,
    sourceKind: item.sourceKind,
  }));
}

export async function evaluateChannel(options: {
  channelId: ChannelId;
  channelLabel: string;
  eligibleRoles: string[];
  roleRules: string[];
  cudyBrief: string;
  commonBrief: string;
  configuration: EvaluatorConfiguration;
  discoveryItems: DiscoveryItem[];
  fixedCandidates?: unknown[];
  fetchImplementation?: typeof fetch;
}): Promise<EvaluatedChannel> {
  const fixed = options.fixedCandidates !== undefined;
  const task = fixed ? options.configuration.fixedListEvaluationPrompt : options.configuration.taskPrompt;
  const { parsed, response, latencyMs } = await invokeClaude(options.configuration, {
    task,
    channel: { id: options.channelId, label: options.channelLabel, eligibleRoles: options.eligibleRoles },
    cudyBrief: options.cudyBrief,
    commonDiscoveryBrief: options.commonBrief,
    compactRoleRules: options.roleRules,
    outputSchema: evaluatorSchema(),
    ...(fixed ? { fixedCandidates: options.fixedCandidates } : { discoveryResults: compactItems(options.discoveryItems) }),
  }, options.fetchImplementation ?? fetch);
  const selected = Array.isArray(parsed.selectedCandidates)
    ? parsed.selectedCandidates.slice(0, 10).map(parseCandidate) : [];
  const rejected = Array.isArray(parsed.rejectedItems) ? parsed.rejectedItems.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [{
      title: sanitizeText(stringValue(item.title)).slice(0, 300),
      url: canonicalPublicUrl(item.url),
      reason: sanitizeText(stringValue(item.reason)).slice(0, 1_000),
    }];
  }) : [];
  return {
    channelId: options.channelId,
    selectedCandidates: selected,
    rejectedItems: rejected,
    evaluator: {
      requestedModel: options.configuration.model,
      returnedModel: response.model ?? options.configuration.model,
      requestCount: 1,
      latencyMs,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
    rawResponse: response,
  };
}
