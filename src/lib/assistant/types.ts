import type { RagCitation } from "@/lib/rag/types";
import type { ChannelRole } from "@/lib/domain";

export type AssistantIntent = "knowledge-question" | "hybrid-research" | "lead-search" | "clarification" | "general";
export type AssistantActionStatus = "proposed" | "confirmed" | "running" | "completed" | "failed" | "cancelled";
export type LeadSearchOpportunityTarget = "OEM/ODM";
export type LeadSearchCoverageMode = "auto" | "local" | "national" | "mixed";

export interface LeadSearchPlan {
  countryCode: string;
  countryName: string;
  objective: "new-market" | "existing-distributor-growth";
  roles: ChannelRole[];
  targetCount: number;
  queryLanguage: string;
  userRequest: string;
  /** Optional for backward compatibility with already-persisted plans; runtime normalization supplies safe defaults. */
  opportunityTargets?: LeadSearchOpportunityTarget[];
  coverageMode?: LeadSearchCoverageMode;
  verifiedOnly?: boolean;
}

export interface AssistantConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface IntentPlan {
  intent: AssistantIntent;
  confidence: number;
  internalQuestion?: string;
  externalQuestions: string[];
  leadPlan?: LeadSearchPlan;
  reply?: string;
  plannerModel: string;
  plannerSource: "kimi-light" | "kimi-k3" | "deterministic-fallback";
  plannerCalls?: Array<{
    requestedModel: string;
    actualModel: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    attempts: number;
    retries: number;
  }>;
  warnings: string[];
}

export interface WebCitation {
  url: string;
  title: string;
}

export interface ExternalSearchAnswer {
  answer: string;
  citations: WebCitation[];
  searchQueries: string[];
  model: string;
  latencyMs: number;
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  status: "active" | "archived";
  updatedAt: string;
  messageCount: number;
}

export interface AssistantMessageDto {
  id: string;
  role: "user" | "assistant" | "system";
  intent: AssistantIntent;
  content: string;
  metadata: {
    citations?: RagCitation[];
    grounded?: boolean;
    warnings?: string[];
    webCitations?: WebCitation[];
    planner?: Pick<IntentPlan, "confidence" | "plannerModel" | "plannerSource">;
    actionId?: string;
    searchResult?: Record<string, unknown>;
  };
  createdAt: string;
}

export interface AssistantActionDto {
  id: string;
  actionType: "lead-search";
  status: AssistantActionStatus;
  payload: LeadSearchPlan;
  result: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConversationDto {
  id: string;
  title: string;
  status: "active" | "archived";
  messages: AssistantMessageDto[];
  actions: AssistantActionDto[];
}
