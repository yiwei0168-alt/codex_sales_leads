import { z } from "zod";

import type { DevelopmentContext, DevelopmentStrategyDto } from "./types";

export const feedbackSchema = z.object({
  subjectOptions: z.array(z.string().min(2).max(240)).min(1).max(5),
  revisedBodyWithCitations: z.string().min(100).max(30_000),
  memoryEvaluation: z.object({
    valuable: z.boolean(), summary: z.string().trim().min(10).max(3_000)
      .transform((value) => value.length > 1_000 ? `${value.slice(0, 997)}...` : value).optional(),
    reason: z.string().min(2).transform((value) => value.slice(0, 500)),
    marketCodes: z.array(z.string().min(2).max(40)).max(10),
    channelRoles: z.array(z.string().min(2).max(80)).max(10),
  }),
}).superRefine((value, context) => {
  if (value.memoryEvaluation.valuable && !value.memoryEvaluation.summary) {
    context.addIssue({ code: "custom", path: ["memoryEvaluation", "summary"],
      message: "Reusable memory requires a standalone summary" });
  }
});

export interface OutreachFeedbackModelResult {
  subjectOptions: string[];
  revisedBody: string;
  evidenceIds: string[];
  knowledgeIds: string[];
  memory: z.infer<typeof feedbackSchema>["memoryEvaluation"];
  model: string;
  generationMetrics: DevelopmentStrategyDto["generationMetrics"];
}

export function parseOutreachJson(content: string): unknown {
  return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

export function evidencePayload(context: DevelopmentContext) {
  return context.company.evidence.slice(0, 8).map((item) => ({
    evidenceId: item.id, title: item.title, claim: item.claim, summary: item.summary,
    sourceUrl: item.sourceUrl, status: item.status, confidence: item.confidence,
  }));
}

export function knowledgePayload(context: DevelopmentContext) {
  return context.knowledge.map((item) => ({
    knowledgeId: item.id, kind: item.kind, title: item.title, content: item.content,
    markets: item.marketCodes, roles: item.channelRoles, priority: item.priorityWeight, provenance: item.sourceRefs,
  }));
}

export function cleanCitations(
  bodyWithCitations: string,
  allowedEvidence: Set<string>,
  allowedKnowledge: Set<string>,
) {
  const evidenceIds = [...bodyWithCitations.matchAll(/\[EVIDENCE:([^\]]+)\]/g)].map((match) => match[1]);
  const knowledgeIds = [...bodyWithCitations.matchAll(/\[KNOWLEDGE:([0-9a-f-]{36})\]/gi)]
    .map((match) => match[1].toLowerCase());
  if (evidenceIds.some((id) => !allowedEvidence.has(id))) throw new Error("Outreach draft invented company evidence IDs");
  if (knowledgeIds.some((id) => !allowedKnowledge.has(id))) throw new Error("Outreach draft invented outreach knowledge IDs");
  if (allowedEvidence.size > 0 && evidenceIds.length === 0) {
    throw new Error("Outreach draft omitted evidence markers for personalization");
  }
  return {
    body: bodyWithCitations.replace(/\s*\[(?:EVIDENCE:[^\]]+|KNOWLEDGE:[0-9a-f-]{36})\]/gi, "").trim(),
    evidenceIds: [...new Set(evidenceIds)],
    knowledgeIds: [...new Set(knowledgeIds)],
  };
}

export function cleanHandoffCitations(
  bodyWithCitations: string,
  context: DevelopmentContext,
  allowedKnowledge: Set<string>,
) {
  const allowedFacts = new Map((context.handoff?.externallyUsableFacts ?? [])
    .filter((fact) => context.handoff?.personalizationHooks.some((hook) => hook.allowedInEmail
      && hook.basedOnFactIds.includes(fact.factId)))
    .map((fact) => [fact.factId, fact]));
  const factIds = [...bodyWithCitations.matchAll(/\[LEAD:([^\]]+)\]/g)].map((match) => match[1]);
  const knowledgeIds = [...bodyWithCitations.matchAll(/\[KNOWLEDGE:([0-9a-f-]{36})\]/gi)]
    .map((match) => match[1].toLowerCase());
  if (factIds.some((id) => !allowedFacts.has(id))) throw new Error("Outreach draft invented or used a blocked lead fact ID");
  if (knowledgeIds.some((id) => !allowedKnowledge.has(id))) throw new Error("Outreach draft invented outreach knowledge IDs");
  if (allowedFacts.size > 0 && factIds.length === 0) throw new Error("Outreach draft omitted lead fact markers for personalization");
  const evidenceIds = factIds.flatMap((id) => allowedFacts.get(id)?.evidenceIds ?? []);
  return {
    body: bodyWithCitations.replace(/\s*\[(?:LEAD:[^\]]+|KNOWLEDGE:[0-9a-f-]{36})\]/gi, "").trim(),
    factIds: [...new Set(factIds)],
    evidenceIds: [...new Set(evidenceIds)],
    knowledgeIds: [...new Set(knowledgeIds)],
  };
}
