import type { ChannelRole, CompanyRecord } from "@/lib/domain";

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
  collection: "product" | "company";
  title: string;
  content: string;
  score: number;
  corroborated: boolean;
  structuredFacts: Array<{ model: string; factKey: string; factValue: string; status: string }>;
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

export interface DevelopmentDraft {
  language: string;
  subjectOptions: string[];
  body: string;
  wordCount: number;
  placeholders: string[];
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
  status: "generated" | "approved" | "sent" | "cancelled";
  createdAt: string;
}

export interface DevelopmentGenerationOptions {
  companyExternalId: string;
  contactId?: string;
  language?: string;
  tone?: string;
  targetLength?: number;
  instructions?: string;
}
