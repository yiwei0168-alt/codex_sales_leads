import type {
  ChannelRelationship,
  CompanyRecord,
  DevelopmentPlan,
  Evidence,
} from "@/lib/domain";

export interface SearchBrief {
  market: string;
  objective: "new-market" | "existing-distributor-growth";
  roles: string[];
  hardFilters: string[];
  preferences: string[];
  exclusions: string[];
  resultLimit: number;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  retrievedAt: string;
}

export interface SearchProvider {
  readonly id: string;
  search(brief: SearchBrief, signal?: AbortSignal): Promise<SearchHit[]>;
}

export interface StructuredAiRequest<TInput> {
  task: "market-playbook" | "evidence-extraction" | "classification" | "relationship" | "development-plan" | "contact-verification";
  modelVersion: string;
  promptVersion: string;
  input: TInput;
  evidenceIds: string[];
}

export interface StructuredAiResponse<TOutput> {
  output: TOutput;
  modelVersion: string;
  promptVersion: string;
  latencyMs: number;
  warnings: string[];
  providerRequestId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
}

export interface AiProvider {
  readonly id: string;
  execute<TInput, TOutput>(request: StructuredAiRequest<TInput>, signal?: AbortSignal): Promise<StructuredAiResponse<TOutput>>;
}

export interface ChannelRepository {
  listCompanies(workspaceId: string): Promise<CompanyRecord[]>;
  saveCompany(workspaceId: string, company: CompanyRecord): Promise<void>;
  listEvidence(companyId: string): Promise<Evidence[]>;
  listRelationships(workspaceId: string): Promise<ChannelRelationship[]>;
  saveDevelopmentPlan(nodeId: string, plan: DevelopmentPlan): Promise<void>;
}

export class ProviderUnavailableError extends Error {
  constructor(providerId: string, cause?: unknown) {
    super(`Provider ${providerId} is unavailable. The application must show an explicit degraded state.`);
    this.name = "ProviderUnavailableError";
    this.cause = cause;
  }
}
