import { budgetedFetch } from "@/lib/billing/paid-fetch";
import { geminiGatewayModel, geminiGroundedRequest, parseGeminiGroundedCompletion } from "@/providers/gemini-openrouter";
import { getOpenRouterConfig, openRouterChatCompletionsUrl, openRouterRequestHeaders } from "@/providers/openrouter";
import type { ExternalSearchAnswer } from "./types";

export async function searchExternalWithGemini(
  questions: string[],
  fetchImplementation: typeof fetch = fetch,
): Promise<ExternalSearchAnswer> {
  const config = getOpenRouterConfig();
  const model = geminiGatewayModel();
  const startedAt = Date.now();
  const requestBody = JSON.stringify(geminiGroundedRequest([
    "Research only the following public-web questions. Do not answer from private or assumed Cudy data.",
    "Use Google Search, prefer primary/official and recent sources, distinguish facts from inference, and cite every material claim.",
    `Current date: ${new Date().toISOString().slice(0, 10)}.`,
    ...questions.slice(0, 5).map((question, index) => `${index + 1}. ${question}`),
  ].join("\n"), model));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await budgetedFetch(fetchImplementation)(openRouterChatCompletionsUrl(config), {
      method: "POST", headers: openRouterRequestHeaders(config), redirect: "error",
      signal: AbortSignal.timeout(Number(process.env.GEMINI_SEARCH_TIMEOUT_MS ?? 90_000)),
      body: requestBody,
    });
    if (response.ok) return { ...parseGeminiGroundedCompletion(await response.json(), model), latencyMs: Date.now() - startedAt };
    // Keep the established bounded HTTP retry; never replay a partial successful response.
    await response.body?.cancel();
    if ((response.status !== 429 && response.status < 500) || attempt === 2) throw new Error(`Gemini gateway HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  throw new Error("Gemini gateway request failed");
}
