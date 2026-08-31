import { createHash } from "node:crypto";

import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { DeepSeekProvider } from "./deepseek";
import { OpenAiCompatibleProvider } from "./openai-compatible";

export type AiDataClassification = "public" | "private-workspace";

export interface AiFallbackRoute {
  provider: AiProvider;
  routineModel?: string;
  escalationModel?: string;
  approvedDataClassifications: AiDataClassification[];
}

interface ResilientAiProviderOptions {
  fallbacks?: AiFallbackRoute[];
  escalationPrimaryModel?: string;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
}

interface CircuitState { failures: number; openedAt?: number }

function requestKey(request: StructuredAiRequest<unknown>): string {
  return createHash("sha256").update(JSON.stringify({ task: request.task, modelVersion: request.modelVersion,
    promptVersion: request.promptVersion, input: request.input, evidenceIds: request.evidenceIds,
    outputSchema: request.outputSchema })).digest("hex");
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
    this.fallbacks = (options.fallbacks ?? []).slice(0, 2);
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
    let primaryError: unknown = new Error(`Circuit open for primary provider ${this.primary.id}.`);
    if (!this.circuitOpen(this.primary.id)) {
      try {
        const response = await this.primary.execute<TInput, TOutput>(request, signal);
        this.circuits.delete(this.primary.id);
        return { ...response, requestedModelVersion: requestedModel, actualProviderId: this.primary.id };
      } catch (error) {
        primaryError = error;
        this.recordFailure(this.primary.id);
      }
    }
    {
      const classification = request.dataClassification ?? "public";
      const failures = [primaryError];
      for (const route of this.fallbacks) {
        if (!route.approvedDataClassifications.includes(classification) || this.circuitOpen(route.provider.id)) continue;
        const fallbackModel = this.modelFor(route, requestedModel);
        if (!fallbackModel) continue;
        try {
          const response = await route.provider.execute<TInput, TOutput>({ ...request, modelVersion: fallbackModel }, signal);
          this.circuits.delete(route.provider.id);
          return { ...response, requestedModelVersion: requestedModel, actualProviderId: route.provider.id,
            warnings: [`Model fallback used: requested=${requestedModel}; actual=${response.modelVersion}; provider=${route.provider.id}.`,
              ...response.warnings] };
        } catch (error) {
          failures.push(error);
          this.recordFailure(route.provider.id);
        }
      }
      throw new AggregateError(failures, `Primary model ${requestedModel} and approved equivalent fallbacks failed.`);
    }
  }

  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal) {
    const canShare = request.dataClassification !== "private-workspace";
    if (!canShare) return this.executeUnshared<TInput, TOutput>(request, signal);
    const key = requestKey(request as StructuredAiRequest<unknown>);
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

export function createLeadAiProvider(primary: AiProvider = new DeepSeekProvider()): AiProvider {
  const fallbacks = ([fallbackRoute(1), fallbackRoute(2)] as const).filter((route): route is AiFallbackRoute => Boolean(route));
  return new ResilientAiProvider(primary, { fallbacks });
}
