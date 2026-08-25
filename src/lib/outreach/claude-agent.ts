import { z } from "zod";

import {
  cleanCitations,
  evidencePayload,
  feedbackSchema,
  knowledgePayload,
  parseOutreachJson,
  type OutreachFeedbackModelResult,
} from "./feedback-model-shared";
import type { DevelopmentContext, DevelopmentStrategyDto } from "./types";

interface ClaudeResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string | null;
  error?: { message?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface ClaudeStreamEvent {
  type?: string;
  message?: ClaudeResponse;
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function parseClaudeStream(payload: string): ClaudeResponse {
  const result: ClaudeResponse = { content: [] };
  let text = "";
  for (const block of payload.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    const event = JSON.parse(data) as ClaudeStreamEvent;
    if (event.type === "error") throw new Error(event.error?.message ?? "Claude streaming error");
    if (event.type === "message_start") {
      result.model = event.message?.model;
      result.usage = { input_tokens: event.message?.usage?.input_tokens };
    } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      text += event.delta.text ?? "";
    } else if (event.type === "message_delta") {
      result.stop_reason = event.delta?.stop_reason;
      result.usage = { ...result.usage, output_tokens: event.usage?.output_tokens };
    }
  }
  result.content = [{ type: "text", text }];
  return result;
}

async function readClaudeResponse(response: Response): Promise<ClaudeResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) return parseClaudeStream(await response.text());
  return response.json() as Promise<ClaudeResponse>;
}

function messagesUrl(): string {
  const parsed = new URL(process.env.CLAUDE_BASE_URL?.trim() || "https://api.anthropic.com");
  if (parsed.protocol !== "https:" || !["api.anthropic.com", "lingyuapi.com"].includes(parsed.hostname)
    || parsed.username || parsed.password) {
    throw new Error("CLAUDE_BASE_URL 必须是受信任的 Anthropic 或 Lingyu HTTPS API 地址");
  }
  const base = parsed.toString().replace(/\/$/, "");
  return /\/v1$/i.test(base) ? `${base}/messages` : `${base}/v1/messages`;
}

async function invokeClaudeJson(
  system: string,
  user: string,
  fetchImplementation: typeof fetch,
): Promise<{ value: unknown; model: string; metrics: DevelopmentStrategyDto["generationMetrics"] }> {
  const startedAt = Date.now();
  const apiKey = process.env.CLAUDE_API_KEY?.trim();
  if (!apiKey) throw new Error("CLAUDE_API_KEY is not configured for outreach revision");
  const model = process.env.CLAUDE_OUTREACH_MODEL?.trim() || process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";
  const requestBody = JSON.stringify({
    model,
    max_tokens: Number(process.env.CLAUDE_OUTREACH_MAX_TOKENS ?? 4_000),
    temperature: Number(process.env.CLAUDE_OUTREACH_TEMPERATURE ?? 0.4),
    stream: true,
    system,
    messages: [{ role: "user", content: user }],
  });
  let body: ClaudeResponse = {};
  let status = 500;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImplementation(messagesUrl(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          "anthropic-version": process.env.CLAUDE_API_VERSION?.trim() || "2023-06-01",
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(Number(process.env.CLAUDE_OUTREACH_TIMEOUT_MS ?? 240_000)),
        body: requestBody,
      });
    } catch (error) {
      if (error instanceof Error && /timeout|aborted/i.test(`${error.name} ${error.message}`)) throw error;
      if (attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    status = response.status;
    body = await readClaudeResponse(response);
    if (response.ok) break;
    const transient = response.status === 429 || response.status >= 500
      || /overload|temporar|rate limit/i.test(body.error?.message ?? "");
    if (!transient || attempt === 1) throw new Error(body.error?.message ?? `Claude HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (status < 200 || status >= 300) throw new Error(body.error?.message ?? `Claude HTTP ${status}`);
  const content = body.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim();
  if (!content) throw new Error(`Claude returned empty outreach JSON (stop_reason=${body.stop_reason ?? "unknown"})`);
  const promptTokens = body.usage?.input_tokens;
  const completionTokens = body.usage?.output_tokens;
  return {
    value: parseOutreachJson(content),
    model: body.model ?? model,
    metrics: {
      modelCalls: 1,
      latencyMs: Date.now() - startedAt,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens === undefined && completionTokens === undefined
        ? undefined : (promptTokens ?? 0) + (completionTokens ?? 0),
    },
  };
}

export async function reviseDevelopmentDraftWithClaude(
  context: DevelopmentContext,
  current: DevelopmentStrategyDto,
  feedback: string,
  fetchImplementation: typeof fetch = fetch,
  retryInvalidResponse = true,
  validationCorrection?: string,
): Promise<OutreachFeedbackModelResult> {
  const allowedEvidence = new Set(context.company.evidence.map((item) => item.id));
  const allowedKnowledge = new Set(context.knowledge.map((item) => item.id.toLowerCase()));
  let attemptMetrics: DevelopmentStrategyDto["generationMetrics"] | undefined;
  try {
    const response = await invokeClaudeJson([
      "You revise a Cudy B2B development email from explicit user feedback and screen the feedback for private reusable memory.",
      "Follow the user's writing preferences precisely while preserving grounded target-company personalization.",
      "Exercise editorial judgment: write natural, direct business English and do not mechanically list every available advantage.",
      "Prioritize the strongest differentiators for this target; keep product families together as a one-stop portfolio unless the target is a specialist.",
      "Omit unsupported requested metrics or market achievements instead of weakening, generalizing or inventing them.",
      "Use only the supplied company evidence and outreach knowledge. Never invent claims, numbers, people, relationships or commercial terms.",
      "Add an exact internal [EVIDENCE:<id>] marker after every target-company factual sentence and [KNOWLEDGE:<uuid>] after every Cudy, policy or market-proof factual sentence.",
      "When companyEvidence is non-empty, the revised body must use at least one allowed evidence marker. When outreachKnowledge is non-empty, use at least one allowed knowledge marker.",
      "Reusable private memory may include stable cross-company style, positioning and channel rules, plus sender identity explicitly approved by the user for private memory.",
      "Do not memorize target-company-specific edits, unapproved personal data, secrets or unsupported claims.",
      "If memory is valuable, summarize only reusable rules in at most 800 characters; never copy the full feedback into memory.",
      "Return one JSON object only. Do not wrap it in markdown and do not include commentary.",
      validationCorrection ? `Your previous output failed validation: ${validationCorrection}. Correct that exact issue.` : "",
    ].filter(Boolean).join("\n"), JSON.stringify({
      target: { name: context.company.displayName, country: context.company.country, roles: context.company.roles },
      strategy: current.strategy,
      currentSubjects: current.draft.subjectOptions,
      currentBody: current.draft.body,
      userFeedback: feedback.slice(0, 4_000),
      companyEvidence: evidencePayload(context),
      outreachKnowledge: knowledgePayload(context),
      allowedEvidenceIds: [...allowedEvidence],
      allowedKnowledgeIds: [...allowedKnowledge],
      outputSchema: {
        subjectOptions: ["string"],
        revisedBodyWithCitations: "complete revised email with exact required citation markers",
        memoryEvaluation: {
          valuable: "boolean",
          summary: "concise standalone private reusable memory when valuable; maximum 800 characters",
          reason: "string",
          marketCodes: ["ISO/market codes"],
          channelRoles: ["channel role"],
        },
      },
    }), fetchImplementation);
    attemptMetrics = response.metrics;
    const parsed = feedbackSchema.parse(response.value);
    const cleaned = cleanCitations(parsed.revisedBodyWithCitations, allowedEvidence, allowedKnowledge);
    if (allowedKnowledge.size > 0 && cleaned.knowledgeIds.length === 0) {
      throw new Error("Outreach draft omitted knowledge markers for Cudy claims");
    }
    return {
      subjectOptions: parsed.subjectOptions,
      revisedBody: cleaned.body,
      evidenceIds: cleaned.evidenceIds,
      knowledgeIds: cleaned.knowledgeIds,
      memory: parsed.memoryEvaluation,
      model: response.model,
      generationMetrics: response.metrics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (retryInvalidResponse && (error instanceof SyntaxError || error instanceof z.ZodError
      || /empty outreach JSON|omitted .* markers|invented .* IDs/i.test(message))) {
      const retried = await reviseDevelopmentDraftWithClaude(
        context, current, feedback, fetchImplementation, false, message.slice(0, 500),
      );
      if (!attemptMetrics) return retried;
      return {
        ...retried,
        generationMetrics: {
          modelCalls: attemptMetrics.modelCalls + retried.generationMetrics.modelCalls,
          latencyMs: attemptMetrics.latencyMs + retried.generationMetrics.latencyMs,
          promptTokens: (attemptMetrics.promptTokens ?? 0) + (retried.generationMetrics.promptTokens ?? 0),
          completionTokens: (attemptMetrics.completionTokens ?? 0) + (retried.generationMetrics.completionTokens ?? 0),
          totalTokens: (attemptMetrics.totalTokens ?? 0) + (retried.generationMetrics.totalTokens ?? 0),
        },
      };
    }
    throw error;
  }
}
