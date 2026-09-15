import {BudgetDeniedError,IncompleteModelOutputError} from "@/lib/billing/policy";
import {compatibleOutputTask,textOutputLimit,textOutputCompletion} from "@/lib/billing/text-output-policy";
import { budgetedFetch } from "@/lib/billing/paid-fetch";
import {paidRequestFingerprint} from "@/lib/billing/paid-request-fingerprint";
import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { ProviderUnavailableError } from "./contracts";
import { structuredUserPrompt } from './structured-user-prompt';
import {createHash,randomUUID} from "node:crypto";
import {withModelAttempt,requestScoringVersion} from "@/lib/billing/model-attempt-context";
import {assertLeadRequestBytes} from "./lead-request-bounds";

interface OpenAiCompatibleProviderOptions {
  id: string;
  apiKey: string;
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  maxAttempts?: number;
  defaultHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

interface WireResponse {
  id?: string;
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number } };
  error?: { message?: string };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly maxAttempts: number;

  constructor(private readonly options: OpenAiCompatibleProviderOptions) {
    this.id = options.id;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImplementation = budgetedFetch(options.fetchImplementation ?? fetch);
    this.maxAttempts = Math.max(1, Math.min(2, options.maxAttempts ?? 2));
    const parsed = new URL(this.baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error(`Fallback provider ${this.id} requires a credential-free HTTPS base URL.`);
    }
  }

  private requestBody(request: StructuredAiRequest<unknown>): string {
    const outputCompletionTask=compatibleOutputTask(request.task);
    const outputLimit=outputCompletionTask?textOutputLimit(outputCompletionTask):undefined;
    const openAiModel=/^(openai\/)?(?:gpt-|o[1-9])/.test(request.modelVersion);
    const terraReviewV2=request.task==="lead-review-secondary"&&request.modelVersion==="openai/gpt-5.6-terra";
    return JSON.stringify({
            model: request.modelVersion,
            temperature: terraReviewV2?undefined:0,
            ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}),
            response_format: request.outputSchema ? { type: "json_schema", json_schema: {
              name: request.task.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64), strict: true,
              schema: request.outputSchema,
            } } : { type: "json_object" },
            messages: [
              { role: "system", content: [
                "Return one valid JSON object only, without Markdown.",
                "Use only supplied facts and evidence IDs.",
                request.outputSchema ? `Validate against this JSON Schema: ${JSON.stringify(request.outputSchema)}` : "",
              ].filter(Boolean).join("\n") },
              { role: "user", content: structuredUserPrompt(request) },
            ],
            ...this.options.extraBody,
            ...(outputLimit===undefined?{}:terraReviewV2?{max_tokens:outputLimit}:openAiModel
              ?{max_tokens:undefined,max_completion_tokens:outputLimit}
              :{max_completion_tokens:undefined,max_tokens:outputLimit}),
          });
  }

  requestBytes(request: StructuredAiRequest<unknown>): number {
    return Buffer.byteLength(this.requestBody(request), "utf8");
  }

  cacheIdentity(request: StructuredAiRequest<unknown>): string {
    return createHash("sha256").update(JSON.stringify({
      version: "openai-compatible-wire-cache-v1", provider: this.id,
      endpoint: `${this.baseUrl}/chat/completions`, method: "POST",
      headers: Object.fromEntries(Object.entries(this.options.defaultHeaders ?? {})
        .map(([key, value]) => [key.toLowerCase(), value] as const)
        .sort(([left], [right]) => left.localeCompare(right))),
      body: this.requestBody(request),
    })).digest("hex");
  }

  paidRequestFingerprint(request: StructuredAiRequest<unknown>): string {
    return paidRequestFingerprint("POST",new URL(`${this.baseUrl}/chat/completions`),
      this.requestBody(request));
  }

  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal) {
    const startedAt = performance.now();
    let lastError: unknown;
    let attemptsMade = 0;
    const invocationId = randomUUID();
    const outputCompletionTask=compatibleOutputTask(request.task);
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      attemptsMade = attempt + 1;
      try {
        const response = await withModelAttempt({invocationId,provider:this.id,task:request.task,promptVersion:request.promptVersion,attempt:attempt+1,scoringVersion:requestScoringVersion(request.input),outputCompletionTask},()=>{
          const init:RequestInit={
          method: "POST",
          headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json",
            ...this.options.defaultHeaders },
          signal,
          body: this.requestBody(request),
          };
          assertLeadRequestBytes(request,String(init.body));
          return this.fetchImplementation(`${this.baseUrl}/chat/completions`,init);
        });
        let body:WireResponse;
        try{body=await response.json() as WireResponse;}
        catch(error){if(response.ok&&outputCompletionTask)throw new IncompleteModelOutputError();throw error;}
        if (!response.ok) throw new Error(body.error?.message ?? `${this.id} HTTP ${response.status}`);
        if(textOutputCompletion(outputCompletionTask,body)==="incomplete")throw new IncompleteModelOutputError();
        const content = body.choices?.[0]?.message?.content?.trim();
        if (!content) throw new Error(`${this.id} returned empty JSON content`);
        if (body.choices?.[0]?.finish_reason === "length") throw new Error(`${this.id} JSON output was truncated`);
        const output = JSON.parse(content) as TOutput;
        return {
          output,
          modelVersion: body.model ?? request.modelVersion,
          promptVersion: request.promptVersion,
          latencyMs: Math.round(performance.now() - startedAt),
          warnings: [],
          providerRequestId: body.id,
          usage: body.usage ? { promptTokens: body.usage.prompt_tokens ?? 0,
            completionTokens: body.usage.completion_tokens ?? 0,
            reasoningTokens: body.usage.completion_tokens_details?.reasoning_tokens ?? 0,
            totalTokens: body.usage.total_tokens ?? (body.usage.prompt_tokens ?? 0) + (body.usage.completion_tokens ?? 0),
            cachedPromptTokens: body.usage.prompt_tokens_details?.cached_tokens ?? 0,
            accountCashCostUsd: body.usage.cost } : undefined,
        } satisfies StructuredAiResponse<TOutput>;
      } catch (error) {
        if(error instanceof BudgetDeniedError)throw error;
        lastError = error;
        if (signal?.aborted) throw error;
        if (attempt < this.maxAttempts - 1) await delay(300 * (attempt + 1));
      }
    }
    throw new ProviderUnavailableError(this.id, lastError, {
      attempts: attemptsMade,
      retries: Math.max(0, attemptsMade - 1),
    });
  }
}
