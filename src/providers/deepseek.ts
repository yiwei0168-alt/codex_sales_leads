import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { ProviderUnavailableError } from "./contracts";

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
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async execute<TInput, TOutput>(
    request: StructuredAiRequest<TInput>,
    signal?: AbortSignal,
  ): Promise<StructuredAiResponse<TOutput>> {
    if (!this.apiKey) throw new ProviderUnavailableError(this.id, new Error("DEEPSEEK_API_KEY is not configured"));
    const model = request.modelVersion.trim() || this.defaultModel;
    const startedAt = performance.now();
    let lastError: unknown;
    const systemPrompt = [
      "Return one valid JSON object only, with no Markdown or commentary.",
      "Follow the task instructions and never invent evidence IDs or facts not present in the input JSON.",
      request.outputSchema ? `Your entire response MUST validate against this JSON Schema: ${JSON.stringify(request.outputSchema)}` : "",
    ].filter(Boolean).join("\n");
    const userPrompt = JSON.stringify({
      task: request.task,
      promptVersion: request.promptVersion,
      evidenceIds: request.evidenceIds,
      input: request.input,
    });
    const maxTokens = Math.max(1_024, Math.min(16_384,
      Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS ?? 8_192) || 8_192));
    const temperature = Math.max(0, Math.min(2, Number(process.env.DEEPSEEK_TEMPERATURE ?? 0) || 0));
    const useAnthropicTransport = process.env.DEEPSEEK_TRANSPORT?.trim().toLowerCase() === "anthropic"
      || (!process.env.DEEPSEEK_TRANSPORT && model.includes("pro"));

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImplementation(useAnthropicTransport
          ? `${this.baseUrl}/anthropic/v1/messages` : `${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: useAnthropicTransport ? {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          } : { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(useAnthropicTransport ? {
            model,
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
            thinking: { type: "disabled" },
          } : {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            thinking: { type: model.includes("pro") ? "enabled" : "disabled" },
            temperature,
            max_tokens: maxTokens,
          }),
          signal,
        });
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

    throw new ProviderUnavailableError(this.id, lastError);
  }
}
