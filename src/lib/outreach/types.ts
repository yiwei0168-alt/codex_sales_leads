import type { ChannelRole, CompanyRecord } from "@/lib/domain";
import type { LeadDevelopmentHandoff } from "@/lib/leads/workflow/types";

export interface OutreachTemplate {
  id: string;
  visibility: "shared" | "private";
  source: "team-library" | "mailbox-approved" | "user-created";
  title: string;
  language: string;
  channelRoles: ChannelRole[];
  targetTitles: string[];
  subjectPattern: string;
  body: string;
  styleProfile: Record<string, unknown>;
}
export interface OutreachKnowledgeItem {
  id: string;
  kind: "company-profile" | "distribution-policy" | "market-proof" | "feedback-memory"
    | "cooperation-path-preference" | "user-approved-marketing-claim";
  title: string;
  content: string;
  marketCodes: string[];
  channelRoles: string[];
  priorityWeight: number;
  sourceRefs: Record<string, unknown>;
  score: number;
}

export interface OutreachRecipient {
  contactId?: string;
  name?: string;
  title?: string;
  email?: string;
  emailStatus?: string;
}

export interface DevelopmentContext {
  userId: string;
  workspaceId: string;
  companyId: string;
  searchRunId?: string;
  company: CompanyRecord;
  assessment?: {
    dimensions: Record<string, number>;
    reasons: string[];
    risks: string[];
    unknowns: string[];
    evidenceIds: string[];
  };
  playbook?: Record<string, unknown>;
  handoff?: LeadDevelopmentHandoff;
  recipient?: OutreachRecipient;
  knowledge: OutreachKnowledgeItem[];
  templates: OutreachTemplate[];
}

export interface DevelopmentStrategy {
  objective: string;
  personalizationAngle: string;
  valuePropositions: string[];
  recommendedProducts: string[];
  targetTitles: string[];
  likelyObjections: string[];
  callToAction: string;
  followUpPlan: string[];
  evidenceIds: string[];
  knowledgeIds: string[];
}

export interface DevelopmentStrategyPlanResult {
  strategy: DevelopmentStrategy;
  evidenceIds: string[];
  knowledgeIds: string[];
  warnings: string[];
  model: string;
  promptVersion: string;
  generationMetrics: DevelopmentGenerationMetrics;
}

export interface DevelopmentDraft {
  language: string;
  subjectOptions: string[];
  body: string;
  wordCount: number;
  placeholders: string[];
}

export interface DevelopmentGenerationMetrics {
  modelCalls: number;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  accountCashCostUsd?: number;
}

export interface DevelopmentStrategyDto {
  id: string;
  companyExternalId: string;
  recipient?: OutreachRecipient;
  strategy: DevelopmentStrategy;
  draft: DevelopmentDraft;
  evidenceIds: string[];
  knowledgeIds: string[];
  templateIds: string[];
  warnings: string[];
  model: string;
  promptVersion: string;
  generationMetrics: DevelopmentGenerationMetrics;
  status: "generated" | "approved" | "sent" | "cancelled";
  revision: number;
  createdAt: string;
}

export interface OutreachFeedbackResult {
  feedbackId: string;
  draft: DevelopmentStrategyDto;
  memoryStored: boolean;
  memorySummary?: string;
  memoryReason: string;
}

export interface DevelopmentFeedbackOptions {
  draftId: string;
  feedback: string;
  currentBody: string;
  sourceRevision: number;
  allowMemory: boolean;
}

export interface DevelopmentGenerationOptions {
  companyExternalId: string;
  contactId?: string;
  language?: string;
  tone?: string;
  targetLength?: number;
  instructions?: string;
}
