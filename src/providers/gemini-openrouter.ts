import { z } from "zod";
import { getOpenRouterConfig } from "./openrouter";

export function geminiGatewayModel(value = process.env.GEMINI_SEARCH_MODEL): string {
  const model = value?.trim() || "gemini-3.6-flash";
  const qualified = model.startsWith("google/") ? model : `google/${model}`;
  if (!/^google\/gemini-[a-z0-9.-]+$/i.test(qualified)) throw new Error("Invalid Gemini gateway model");
  return qualified;
}

export function geminiGroundedRequest(input: string, model = geminiGatewayModel()) {
  return {
    model: geminiGatewayModel(model),
    messages: [{ role: "user", content: input }],
    plugins: [{ id: "web", engine: "native" }],
    reasoning: { effort: "low" },
    max_tokens: 12_000,
    provider: { ...getOpenRouterConfig().providerPreferences, allow_fallbacks: false },
  };
}

const completion = z.object({
  model: z.string().optional(),
  error: z.unknown().optional(),
  choices: z.array(z.object({
    finish_reason: z.string().nullable(),
    message: z.object({ content: z.string().nullable(), annotations: z.array(z.unknown()).optional() }),
  })).min(1),
});
const annotation = z.object({ type: z.literal("url_citation"), url_citation: z.object({
  url: z.string(), title: z.string().optional(),
}) });

/** Gateway annotations are source receipts, not a log of Google's executed queries. */
export function parseGeminiGroundedCompletion(value: unknown, fallbackModel: string) {
  const parsed = completion.safeParse(value);
  if (!parsed.success || parsed.data.error !== undefined) throw new Error("Gemini gateway returned invalid output");
  const choice = parsed.data.choices[0];
  if (choice.finish_reason !== "stop") throw new Error("Gemini 外部搜索结果未完成，已拒绝部分答案");
  const answer = choice.message.content?.trim();
  if (!answer) throw new Error("Gemini 外部搜索没有返回可用答案");
  const citations = new Map<string, { url: string; title: string }>();
  for (const item of choice.message.annotations ?? []) {
    const result = annotation.safeParse(item);
    if (!result.success) continue;
    try {
      const source = result.data.url_citation;
      const url = new URL(source.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
      citations.set(url.toString(), { url: url.toString(), title: source.title?.trim() || url.hostname });
    } catch { /* Malformed source URLs never become evidence. */ }
  }
  if (!citations.size) throw new Error("Gemini 搜索结果缺少网页引用，外部答案已拒绝");
  return { answer, citations: [...citations.values()], model: parsed.data.model ?? fallbackModel,
    searchQueries: [] as string[], searchQueryStatus: "not-provided" as const,
    groundingSource: "openrouter-url-annotations" as const };
}
