import { createHash } from "node:crypto";
import { currentSpendContext } from "@/lib/billing/context";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { ProviderUnavailableError } from "./contracts";
import { DeepSeekProvider } from "./deepseek";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import { getOpenRouterConfig } from "./openrouter";

export type AiDataClassification = "public" | "private-workspace";

export interface AiFallbackRoute {
  provider: AiProvider;
  routineModel?: string;
  escalationModel?: string;
  approvedDataClassifications: AiDataClassification[];
  timeoutMs?: number;
}

interface ResilientAiProviderOptions {
  fallbacks?: AiFallbackRoute[];
  escalationPrimaryModel?: string;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
}

interface CircuitState { failures: number; openedAt?: number }

function failureTelemetry(error: unknown): { attempts: number; retries: number } {
  if (error instanceof ProviderUnavailableError) {
    return { attempts: error.telemetry.attempts ?? 1, retries: error.telemetry.retries ?? 0 };
  }
  if (error instanceof ResilientAiAggregateError) {
    return { attempts: error.attempts, retries: error.retries };
  }
  return { attempts: 1, retries: 0 };
}

function failureMessage(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!(current instanceof Error)) break;
    if (!(current.cause instanceof Error)) return current.message;
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}

function shouldTripCircuit(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!(current instanceof Error)) break;
    if (current.name === "AbortError" || current.name === "TimeoutError"
      || /abort(?:ed)? due to timeout|timed?\s*out/i.test(current.message)) return false;
    current = current.cause;
  }
  return true;
}

class ResilientAiAggregateError extends AggregateError {
  readonly attempts: number;
  readonly retries: number;
  constructor(errors: unknown[], message: string) {
    super(errors, message);
    const telemetry = errors.map(failureTelemetry);
    this.attempts = telemetry.reduce((sum, item) => sum + item.attempts, 0);
    this.retries = telemetry.reduce((sum, item) => sum + item.retries, 0);
  }
}

function requestKey(request: StructuredAiRequest<unknown>): string {
  return createHash("sha256").update(JSON.stringify({ task: request.task, modelVersion: request.modelVersion,
    promptVersion: request.promptVersion, input: request.input, evidenceIds: request.evidenceIds,
    outputSchema: request.outputSchema, reasoningEffort: request.reasoningEffort })).digest("hex");
}

export class ResilientAiProvider implements AiProvider {
  readonly id: string;
  private readonly fallbacks: AiFallbackRoute[];
  private readonly circuits = new Map<string, CircuitState>();
  private readonly inFlight = new Map<string, Promise<StructuredAiResponse<unknown>>>();
  private readonly escalationPrimaryModel: string;
  private readonly circuitFailureThreshold: number;
  private readonly circuitCooldownMs: number;

  constructor(private readonly primary: AiProvider, options: ResilientAiProviderOptions = {}) {
    this.id = `resilient:${primary.id}`;
    this.fallbacks = (options.fallbacks ?? []).slice(0, 4);
    this.escalationPrimaryModel = options.escalationPrimaryModel ?? process.env.DEEPSEEK_ESCALATION_MODEL?.trim() ?? "deepseek-v4-pro";
    this.circuitFailureThreshold = Math.max(1, options.circuitFailureThreshold ?? 2);
    this.circuitCooldownMs = Math.max(1_000, options.circuitCooldownMs ?? 60_000);
  }

  private circuitOpen(providerId: string): boolean {
    const state = this.circuits.get(providerId);
    if (!state?.openedAt) return false;
    if (Date.now() - state.openedAt < this.circuitCooldownMs) return true;
    this.circuits.delete(providerId);
    return false;
  }

  private recordFailure(providerId: string): void {
    const state = this.circuits.get(providerId) ?? { failures: 0 };
    state.failures += 1;
    if (state.failures >= this.circuitFailureThreshold) state.openedAt = Date.now();
    this.circuits.set(providerId, state);
  }

  private modelFor(route: AiFallbackRoute, requestedModel: string): string | undefined {
    const escalation = requestedModel === this.escalationPrimaryModel || /(?:pro|reason|large|opus|sonnet)/i.test(requestedModel);
    return escalation ? route.escalationModel : route.routineModel;
  }

  private async executeUnshared<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal) {
    const requestedModel = request.modelVersion;
    let primaryError: unknown = new ProviderUnavailableError(this.primary.id,
      new Error(`Circuit open for primary provider ${this.primary.id}.`), { attempts: 0, retries: 0 });
    if (!this.circuitOpen(this.primary.id)) {
      try {
        const response = await this.primary.execute<TInput, TOutput>(request, signal);
        this.circuits.delete(this.primary.id);
        return { ...response, requestedModelVersion: requestedModel, actualProviderId: this.primary.id };
      } catch (error) {
        primaryError = error;
        if (shouldTripCircuit(error)) this.recordFailure(this.primary.id);
      }
    }
    {
      const classification = request.dataClassification ?? "public";
      const failures = [primaryError];
      let attemptedFallbacks = 0;
      for (const route of this.fallbacks) {
        if (!route.approvedDataClassifications.includes(classification) || this.circuitOpen(route.provider.id)) continue;
        const fallbackModel = this.modelFor(route, requestedModel);
        if (!fallbackModel) continue;
        if (attemptedFallbacks >= 2) break;
        attemptedFallbacks += 1;
        try {
          const routeSignal = route.timeoutMs
            ? AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(route.timeoutMs)])
            : signal;
          const response = await route.provider.execute<TInput, TOutput>(
            { ...request, modelVersion: fallbackModel }, routeSignal);
          this.circuits.delete(route.provider.id);
          const priorTelemetry = failures.map(failureTelemetry);
          return { ...response, requestedModelVersion: requestedModel, actualProviderId: route.provider.id,
            attempts: priorTelemetry.reduce((sum, item) => sum + item.attempts, 0) + (response.attempts ?? 1),
            retries: priorTelemetry.reduce((sum, item) => sum + item.retries, 0) + (response.retries ?? 0),
            warnings: [`Model fallback used after ${failures.length} route failure(s) (${failures.map(failureMessage).join(" | ")}): requested=${requestedModel}; actual=${response.modelVersion}; provider=${route.provider.id}.`,
              ...response.warnings] };
        } catch (error) {
          failures.push(error);
          if (shouldTripCircuit(error)) this.recordFailure(route.provider.id);
        }
      }
      throw new ResilientAiAggregateError(failures,
        `Primary model ${requestedModel} and approved equivalent fallbacks failed: ${failures.map(failureMessage).join(" | ")}`);
    }
  }

  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal) {
    const canShare = request.dataClassification !== "private-workspace";
    if (!canShare) return this.executeUnshared<TInput, TOutput>(request, signal);
    const scope=currentSpendContext();
    const key = `${scope?`${scope.userId}:${scope.operationId}:`:""}${requestKey(request as StructuredAiRequest<unknown>)}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<StructuredAiResponse<TOutput>>;
    const pending = this.executeUnshared<TInput, TOutput>(request, signal);
    this.inFlight.set(key, pending as Promise<StructuredAiResponse<unknown>>);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }
}

function fallbackRoute(index: 1 | 2): AiFallbackRoute | null {
  const prefix = `LEAD_AI_FALLBACK_${index}`;
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim();
  const baseUrl = process.env[`${prefix}_BASE_URL`]?.trim();
  const routineModel = process.env[`${prefix}_ROUTINE_MODEL`]?.trim();
  const escalationModel = process.env[`${prefix}_ESCALATION_MODEL`]?.trim();
  const privacyApproved = process.env[`${prefix}_DATA_PERMISSION_APPROVED`]?.trim().toLowerCase() === "true";
  if (!apiKey || !baseUrl || !privacyApproved || (!routineModel && !escalationModel)) return null;
  const classifications = (process.env[`${prefix}_DATA_CLASSIFICATIONS`] ?? "public")
    .split(",").map((value) => value.trim()).filter((value): value is AiDataClassification =>
      value === "public" || value === "private-workspace");
  return { provider: new OpenAiCompatibleProvider({ id: process.env[`${prefix}_PROVIDER_ID`]?.trim()
    || `lead-fallback-${index}`, apiKey, baseUrl }), routineModel, escalationModel,
  approvedDataClassifications: classifications };
}

function openRouterDeepSeekFallbackRoute(): AiFallbackRoute | null {
  if (!process.env.OPENROUTER_API_KEY?.trim()) return null;
  const config = getOpenRouterConfig();
  return {
    provider: new OpenAiCompatibleProvider({
      id: "openrouter-deepseek",
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultHeaders: config.defaultHeaders,
      extraBody: { provider: config.providerPreferences, reasoning: { effort: "none" } },
    }),
    routineModel: process.env.OPENROUTER_DEEPSEEK_ROUTINE_MODEL?.trim()
      || "deepseek/deepseek-v4-flash",
    escalationModel: process.env.OPENROUTER_DEEPSEEK_ESCALATION_MODEL?.trim()
      || "deepseek/deepseek-v4-pro",
    approvedDataClassifications: ["public"],
    timeoutMs: 45_000,
  };
}

function openRouterOpenAiPeerRoute(): AiFallbackRoute | null {
  if (!process.env.OPENROUTER_API_KEY?.trim()) return null;
  const config = getOpenRouterConfig();
  return {
    provider: new OpenAiCompatibleProvider({
      id: "openrouter-openai-peer",
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultHeaders: config.defaultHeaders,
      extraBody: { provider: config.providerPreferences },
    }),
    routineModel: process.env.OPENROUTER_OPENAI_ROUTINE_MODEL?.trim() || "openai/gpt-4o-mini",
    escalationModel: process.env.OPENROUTER_OPENAI_ESCALATION_MODEL?.trim() || "openai/gpt-4o",
    approvedDataClassifications: ["public"],
    timeoutMs: 25_000,
  };
}

export function createLeadAiProvider(primary: AiProvider = new DeepSeekProvider()): AiProvider {
  const fallbacks = ([openRouterDeepSeekFallbackRoute(), openRouterOpenAiPeerRoute(), fallbackRoute(1),
    fallbackRoute(2)]).filter((route): route is AiFallbackRoute => Boolean(route)).slice(0, 4);
  return new ResilientAiProvider(primary, { fallbacks });
}
