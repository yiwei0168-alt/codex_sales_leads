import type { ExternalSearchAnswer, WebCitation } from "./types";

interface GeminiContentBlock {
  type?: string;
  text?: string;
  annotations?: Array<{ type?: string; url?: string; title?: string }>;
}

interface GeminiStep {
  type?: string;
  arguments?: { queries?: string[] };
  content?: GeminiContentBlock[];
}

interface GeminiInteractionResponse {
  model?: string;
  steps?: GeminiStep[];
  error?: { message?: string };
}

function geminiInteractionsUrl(): string {
  const configured = process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta";
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" || parsed.hostname !== "generativelanguage.googleapis.com"
    || parsed.username || parsed.password) {
    throw new Error("GEMINI_BASE_URL 必须是受信任的 Google HTTPS API 地址");
  }
  parsed.pathname = parsed.pathname.replace(/\/openai(?:\/v1)?\/?$/i, "").replace(/\/$/, "");
  if (!/\/v1(?:beta)?$/i.test(parsed.pathname)) parsed.pathname = `${parsed.pathname}/v1beta`;
  parsed.pathname = `${parsed.pathname}/interactions`;
  return parsed.toString();
}

function safeWebCitation(annotation: GeminiContentBlock["annotations"] extends Array<infer T> | undefined ? T : never): WebCitation | undefined {
  if (annotation?.type !== "url_citation" || !annotation.url) return undefined;
  try {
    const url = new URL(annotation.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return undefined;
    return { url: url.toString(), title: annotation.title?.trim() || url.hostname };
  } catch {
    return undefined;
  }
}

export function parseGeminiInteraction(body: GeminiInteractionResponse, fallbackModel: string, startedAt: number): ExternalSearchAnswer {
  const outputBlocks = (body.steps ?? []).filter((step) => step.type === "model_output").flatMap((step) => step.content ?? [])
    .filter((block) => block.type === "text");
  const answer = outputBlocks.map((block) => block.text ?? "").join("").trim();
  if (!answer) throw new Error("Gemini 外部搜索没有返回可用答案");
  const citationMap = new Map<string, WebCitation>();
  for (const block of outputBlocks) {
    for (const annotation of block.annotations ?? []) {
      const citation = safeWebCitation(annotation);
      if (citation) citationMap.set(citation.url, citation);
    }
  }
  const searchQueries = [...new Set((body.steps ?? []).filter((step) => step.type === "google_search_call")
    .flatMap((step) => step.arguments?.queries ?? []).map((query) => query.trim()).filter(Boolean))];
  if (searchQueries.length === 0) throw new Error("Gemini 未实际调用 Google Search，外部答案已拒绝");
  if (citationMap.size === 0) throw new Error("Gemini 搜索结果缺少网页引用，外部答案已拒绝");
  return { answer, citations: [...citationMap.values()], searchQueries, model: body.model ?? fallbackModel, latencyMs: Date.now() - startedAt };
}

export async function searchExternalWithGemini(
  questions: string[],
  fetchImplementation: typeof fetch = fetch,
): Promise<ExternalSearchAnswer> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  // The v4 production-like benchmark completed 3/3 runs on 3.6 after 3.7 hit repeated high-demand failures.
  const model = process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.6-flash";
  const startedAt = Date.now();
  const requestBody = JSON.stringify({
      model,
      input: [
        "Research only the following public-web questions. Do not answer from private or assumed Cudy data.",
        "Use Google Search, prefer primary/official and recent sources, distinguish facts from inference, and cite every material claim.",
        `Current date: ${new Date().toISOString().slice(0, 10)}.`,
        ...questions.slice(0, 5).map((question, index) => `${index + 1}. ${question}`),
      ].join("\n"),
      tools: [{ type: "google_search" }],
      generation_config: { thinking_level: "low", max_output_tokens: 12_000 },
    });
  let body: GeminiInteractionResponse = {};
  let status = 500;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImplementation(geminiInteractionsUrl(), {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      signal: AbortSignal.timeout(Number(process.env.GEMINI_SEARCH_TIMEOUT_MS ?? 90_000)),
      body: requestBody,
    });
    status = response.status;
    body = await response.json() as GeminiInteractionResponse;
    if (response.ok) break;
    const transient = response.status === 429 || response.status >= 500 || /high demand|overload|temporar/i.test(body.error?.message ?? "");
    if (!transient || attempt === 2) throw new Error(body.error?.message ?? `Gemini HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  if (status < 200 || status >= 300) throw new Error(body.error?.message ?? `Gemini HTTP ${status}`);
  return parseGeminiInteraction(body, model, startedAt);
}
