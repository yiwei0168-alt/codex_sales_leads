import type { RagCitation } from "@/lib/rag/types";
import type { ChannelRole } from "@/lib/domain";

export type AssistantIntent = "knowledge-question" | "lead-search" | "clarification" | "general";
export type AssistantActionStatus = "proposed" | "confirmed" | "running" | "completed" | "failed" | "cancelled";

export interface LeadSearchPlan {
  countryCode: string;
  countryName: string;
  objective: "new-market" | "existing-distributor-growth";
  roles: ChannelRole[];
  targetCount: number;
  queryLanguage: string;
  userRequest: string;
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
