import { z } from "zod";

import { getOpenRouterConfig, openRouterChatCompletionsUrl, openRouterRequestHeaders,
  resolveOpenRouterModel } from "@/providers/openrouter";

import {
  cleanCitations,
  cleanHandoffCitations,
  evidencePayload,
  feedbackSchema,
  knowledgePayload,
  parseOutreachJson,
  type OutreachFeedbackModelResult,
} from "./feedback-model-shared";
import type { DevelopmentContext, DevelopmentStrategyDto } from "./types";

interface ClaudeResponse {
  model?: string;
  choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null } }>;
  error?: { message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
}

async function invokeClaudeJson(
  system: string,
  user: string,
  fetchImplementation: typeof fetch,
): Promise<{ value: unknown; model: string; metrics: DevelopmentStrategyDto["generationMetrics"] }> {
  const startedAt = Date.now();
  const config = getOpenRouterConfig();
  const model = resolveOpenRouterModel(process.env.CLAUDE_OUTREACH_MODEL?.trim()
    || process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4.6", "anthropic");
  const requestBody = JSON.stringify({
    model,
    max_tokens: Number(process.env.CLAUDE_OUTREACH_MAX_TOKENS ?? 4_000),
    temperature: Number(process.env.CLAUDE_OUTREACH_TEMPERATURE ?? 0.4),
    stream: false,
    response_format: { type: "json_object" },
    provider: config.providerPreferences,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  let body: ClaudeResponse = {};
  let status = 500;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImplementation(openRouterChatCompletionsUrl(config), {
        method: "POST",
        headers: openRouterRequestHeaders(config),
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
    body = await response.json() as ClaudeResponse;
    if (response.ok) break;
    const transient = response.status === 429 || response.status >= 500
      || /overload|temporar|rate limit/i.test(body.error?.message ?? "");
    if (!transient || attempt === 1) throw new Error(body.error?.message ?? `Claude HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (status < 200 || status >= 300) throw new Error(body.error?.message ?? `Claude HTTP ${status}`);
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`Claude returned empty outreach JSON (finish_reason=${body.choices?.[0]?.finish_reason ?? "unknown"})`);
  const promptTokens = body.usage?.prompt_tokens;
  const completionTokens = body.usage?.completion_tokens;
  return {
    value: parseOutreachJson(content),
    model: body.model ?? model,
    metrics: {
      modelCalls: 1,
      latencyMs: Date.now() - startedAt,
      promptTokens,
      completionTokens,
      totalTokens: body.usage?.total_tokens ?? (promptTokens === undefined && completionTokens === undefined
        ? undefined : (promptTokens ?? 0) + (completionTokens ?? 0)),
      accountCashCostUsd: body.usage?.cost,
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
      context.handoff
        ? "Use only handoff facts allowed in email and add [LEAD:<fact-id>] after every target-company factual sentence; never use doNotClaim items."
        : "Add an exact internal [EVIDENCE:<id>] marker after every target-company factual sentence.",
      "Add [KNOWLEDGE:<uuid>] after every Cudy, policy or market-proof factual sentence.",
      "When companyEvidence is non-empty, the revised body must use at least one allowed evidence marker. When outreachKnowledge is non-empty, use at least one allowed knowledge marker.",
      "Reusable private memory may include stable cross-company style, positioning and channel rules, plus sender identity explicitly approved by the user for private memory.",
      "Do not memorize target-company-specific edits, unapproved personal data, secrets or unsupported claims.",
      "If memory is valuable, summarize only reusable rules in at most 800 characters; never copy the full feedback into memory.",
      "Return one JSON object only. Do not wrap it in markdown and do not include commentary.",
      validationCorrection ? `Your previous output failed validation: ${validationCorrection}. Correct that exact issue.` : "",
    ].filter(Boolean).join("\n"), JSON.stringify({
      target: { name: context.company.displayName, country: context.company.country, roles: context.company.roles },
      strategy: current.strategy,
      selectedCooperationPath: context.handoff?.decision.cooperationPaths.find((path) =>
        path.pathId === context.handoff?.decision.selectedPathId),
      currentSubjects: current.draft.subjectOptions,
      currentBody: current.draft.body,
      userFeedback: feedback.slice(0, 4_000),
      companyEvidence: context.handoff ? undefined : evidencePayload(context),
      allowedLeadFacts: context.handoff?.externallyUsableFacts.filter((fact) =>
        context.handoff?.personalizationHooks.some((hook) => hook.allowedInEmail
          && hook.basedOnFactIds.includes(fact.factId))),
      doNotClaim: context.handoff?.doNotClaim,
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
    const cleaned = context.handoff
      ? cleanHandoffCitations(parsed.revisedBodyWithCitations, context, allowedKnowledge)
      : cleanCitations(parsed.revisedBodyWithCitations, allowedEvidence, allowedKnowledge);
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
          accountCashCostUsd: (attemptMetrics.accountCashCostUsd ?? 0)
            + (retried.generationMetrics.accountCashCostUsd ?? 0),
        },
      };
    }
    throw error;
  }
}
