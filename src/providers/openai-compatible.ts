import type { AiProvider, StructuredAiRequest, StructuredAiResponse } from "./contracts";
import { ProviderUnavailableError } from "./contracts";

interface OpenAiCompatibleProviderOptions {
  id: string;
  apiKey: string;
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  maxAttempts?: number;
}

interface WireResponse {
  id?: string;
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number;
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
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.maxAttempts = Math.max(1, Math.min(2, options.maxAttempts ?? 2));
    const parsed = new URL(this.baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error(`Fallback provider ${this.id} requires a credential-free HTTPS base URL.`);
    }
  }

  async execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal) {
    const startedAt = performance.now();
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImplementation(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
          signal,
          body: JSON.stringify({
            model: request.modelVersion,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: [
                "Return one valid JSON object only, without Markdown.",
                "Use only supplied facts and evidence IDs.",
                request.outputSchema ? `Validate against this JSON Schema: ${JSON.stringify(request.outputSchema)}` : "",
              ].filter(Boolean).join("\n") },
              { role: "user", content: JSON.stringify({ task: request.task, promptVersion: request.promptVersion,
                evidenceIds: request.evidenceIds, input: request.input }) },
            ],
          }),
        });
        const body = await response.json() as WireResponse;
        if (!response.ok) throw new Error(body.error?.message ?? `${this.id} HTTP ${response.status}`);
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
            totalTokens: body.usage.total_tokens ?? (body.usage.prompt_tokens ?? 0) + (body.usage.completion_tokens ?? 0) } : undefined,
        } satisfies StructuredAiResponse<TOutput>;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
        if (attempt < this.maxAttempts - 1) await delay(300 * (attempt + 1));
      }
    }
    throw new ProviderUnavailableError(this.id, lastError);
  }
}
