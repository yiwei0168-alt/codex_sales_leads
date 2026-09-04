import { planAssistantRequest } from "../src/lib/assistant/intent-agent";
import { searchExternalWithGemini } from "../src/lib/assistant/external-search";
import { synthesizeHybridAnswer } from "../src/lib/assistant/synthesis";
import type { ExternalSearchAnswer } from "../src/lib/assistant/types";

try { process.loadEnvFile(".env.local"); } catch { /* Deployment environments inject variables directly. */ }

const missing = [
  !process.env.KIMI_API_KEY && "KIMI_API_KEY",
  !process.env.GEMINI_API_KEY && "GEMINI_API_KEY",
  !process.env.OPENROUTER_API_KEY && "OPENROUTER_API_KEY",
].filter(Boolean);
if (missing.length > 0) throw new Error(`Assistant model preflight missing: ${missing.join(", ")}`);

const errors: string[] = [];
const planned = await planAssistantRequest("请结合 Cudy WR3000 的内部规格和当前公开市场信息，说明它适合什么场景。");
if (planned.plannerSource !== "kimi-k3" || planned.intent !== "hybrid-research" || planned.externalQuestions.length === 0) {
  errors.push(`Kimi: ${JSON.stringify({ intent: planned.intent, source: planned.plannerSource, warnings: planned.warnings })}`);
}

let external: ExternalSearchAnswer = {
  answer: "外部预检占位证据 [WEB:1]。", citations: [{ url: "https://example.com/", title: "Preflight placeholder" }],
  searchQueries: ["preflight"], model: "preflight-placeholder", latencyMs: 0,
};
try {
  external = await searchExternalWithGemini(["Cudy official website and current WR3000 public product information"]);
} catch (error) {
  errors.push(`Gemini: ${error instanceof Error ? error.message : "unknown error"}`);
}

let synthesis = "";
try {
  synthesis = await synthesizeHybridAnswer(
    "简要整合内部与外部证据。",
    {
      answer: "内部预检证据 [KB:00000000-0000-0000-0000-000000000001]。",
      citations: [{
        chunkId: "00000000-0000-0000-0000-000000000001", documentTitle: "Assistant preflight", excerpt: "internal preflight evidence",
        score: 1, collection: "product", visibility: "shared", retrievalSignals: ["structured"], corroborated: true, structuredFacts: [],
      }],
      grounded: true, model: "preflight", latencyMs: 0, warnings: [],
    },
    external,
  );
  if (!synthesis.trim()) errors.push("OpenAI synthesis: empty output");
} catch (error) {
  errors.push(`OpenAI synthesis: ${error instanceof Error ? error.message : "unknown error"}`);
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  kimi: { ok: planned.plannerSource === "kimi-k3", model: planned.plannerModel, intent: planned.intent },
  gemini: { ok: external.model !== "preflight-placeholder", model: external.model, searches: external.searchQueries.length, citations: external.citations.length },
  openaiSynthesis: { ok: Boolean(synthesis.trim()) },
  errors,
}, null, 2));
if (errors.length > 0) process.exitCode = 1;
