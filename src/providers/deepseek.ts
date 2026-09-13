import {BudgetDeniedError} from "@/lib/billing/policy";
import { budgetedFetch } from "@/lib/billing/paid-fetch";
import {deepSeekRequestBody} from "./deepseek-request";
import {assertLeadRequestBytes} from "./lead-request-bounds";
import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { ProviderUnavailableError } from "./contracts";
import {randomUUID,createHash} from "node:crypto";
import {withModelAttempt,requestScoringVersion} from "@/lib/billing/model-attempt-context";

interface DeepSeekProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImplementation?: typeof fetch;
  maxAttempts?: number;
}

interface DeepSeekWireResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
}

interface DeepSeekAnthropicResponse {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

class DeepSeekRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "DeepSeekRequestError";
  }
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class DeepSeekProvider implements AiProvider {
  readonly id = "deepseek";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly maxAttempts: number;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() ?? process.env.DEEPSEEK_API_KEY?.trim() ?? "";
    this.baseUrl = (options.baseUrl?.trim() || process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, "");
    this.defaultModel = options.defaultModel?.trim() || process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
    this.fetchImplementation = budgetedFetch(options.fetchImplementation ?? fetch);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  cacheIdentity(request:StructuredAiRequest<unknown>):string {
    const model=request.modelVersion.trim()||this.defaultModel;
    // An approval epoch, not a claim that a mutable hosted alias is revision-pinned.
    // Invalidate old Flash snapshots even when an explicit caller retains the alias.
    const flashApprovalEpoch = ["deepseek-flash", "deepseek-v4-flash"].includes(model)
      ? {flashApprovalEpoch:"v4.1-flash-approved-2026-09-13"} : {};
    return createHash("sha256").update(JSON.stringify({version:"deepseek-wire-cache-v1",provider:this.id,
      endpoint:this.baseUrl,...flashApprovalEpoch,...deepSeekRequestBody(request,model)})).digest("hex");
  }

  async execute<TInput, TOutput>(
    request: StructuredAiRequest<TInput>,
    signal?: AbortSignal,
  ): Promise<StructuredAiResponse<TOutput>> {
    if (!this.apiKey) throw new ProviderUnavailableError(this.id, new Error("DEEPSEEK_API_KEY is not configured"));
    const model = request.modelVersion.trim() || this.defaultModel;
    const startedAt = performance.now();
    let lastError: unknown;
    let attemptsMade = 0;
    const invocationId = randomUUID();
    const {body:wireBody,useAnthropicTransport}=deepSeekRequestBody(request,model);
    assertLeadRequestBytes(request,wireBody);

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      attemptsMade = attempt + 1;
      try {
        const response = await withModelAttempt({invocationId,provider:this.id,task:request.task,promptVersion:request.promptVersion,attempt:attempt+1,scoringVersion:requestScoringVersion(request.input)},()=>this.fetchImplementation(useAnthropicTransport
          ? `${this.baseUrl}/anthropic/v1/messages` : `${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: useAnthropicTransport ? {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          } : { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: wireBody,
          signal,
        }));
        const body = await response.json() as DeepSeekWireResponse & DeepSeekAnthropicResponse;
        if (!response.ok) {
          const error = new DeepSeekRequestError(body.error?.message ?? `DeepSeek HTTP ${response.status}`, retryableStatus(response.status));
          if (retryableStatus(response.status) && attempt < this.maxAttempts - 1) {
            lastError = error;
            await delay(250 * (2 ** attempt));
            continue;
          }
          throw error;
        }

        const choice = body.choices?.[0];
        const content = (useAnthropicTransport
          ? body.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("")
          : choice?.message?.content)?.trim();
        if (!content) throw new Error("DeepSeek returned empty JSON content");
        const finishReason = useAnthropicTransport ? body.stop_reason : choice?.finish_reason;
        if (finishReason === "length" || finishReason === "max_tokens") throw new Error("DeepSeek JSON output was truncated");
        let output: TOutput;
        try {
          output = JSON.parse(content) as TOutput;
        } catch (error) {
          if(error instanceof BudgetDeniedError)throw error;
          throw new Error("DeepSeek returned invalid JSON", { cause: error });
        }
        const warnings = finishReason && !["stop", "end_turn"].includes(finishReason) ? [`finish_reason:${finishReason}`] : [];
        return {
          output,
          modelVersion: body.model ?? model,
          promptVersion: request.promptVersion,
          latencyMs: Math.round(performance.now() - startedAt),
          warnings,
          providerRequestId: body.id,
          attempts: attempt + 1,
          retries: attempt,
          usage: body.usage ? {
            promptTokens: body.usage.prompt_tokens ?? body.usage.input_tokens ?? 0,
            completionTokens: body.usage.completion_tokens ?? body.usage.output_tokens ?? 0,
            reasoningTokens: body.usage.completion_tokens_details?.reasoning_tokens ?? 0,
            totalTokens: body.usage.total_tokens
              ?? (body.usage.input_tokens ?? 0) + (body.usage.output_tokens ?? 0),
          } : undefined,
        };
      } catch (error) {
        if(error instanceof BudgetDeniedError)throw error;
        lastError = error;
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        if (error instanceof DeepSeekRequestError && !error.retryable) break;
        if (attempt < this.maxAttempts - 1 && !(error instanceof Error && error.message.startsWith("DeepSeek returned"))) {
          await delay(250 * (2 ** attempt));
          continue;
        }
        break;
      }
    }

    throw new ProviderUnavailableError(this.id, lastError, {
      attempts: attemptsMade,
      retries: Math.max(0, attemptsMade - 1),
    });
  }
}
