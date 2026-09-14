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

export interface LeadRequestPreparation {
  encoding: string;
  originalMaximumWireBytes: number;
  preparedMaximumWireBytes: number;
  evidenceItems: number;
  findingItems: number;
  /** Source text folded only after every corrected finding and citation remains in the request. */
  omittedEvidenceExcerpts?: number;
}

export interface StructuredAiRequest<TInput> {
  task: "market-playbook" | "evidence-extraction" | "classification" | "assistant-intent" | "relationship" | "development-plan" | "contact-verification" | "lead-discovery-gate" | "lead-evidence-correction" | "lead-qualification" | "lead-review-secondary" | "lead-review-judge";
  modelVersion: string;
  promptVersion: string;
  input: TInput;
  evidenceIds: string[];
  /** JSON Schema for providers that need an explicit structured-output contract. */
  outputSchema?: Record<string, unknown>;
  /** Controls whether an approved fallback may receive this request. */
  dataClassification?: "public" | "private-workspace";
  /** Tenant scope is required before private requests may be deduplicated. */
  tenantScope?: string;
  /** Optional cross-provider reasoning budget for compatible gateways. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Aggregate local preparation only; excluded from the provider prompt and cache contract. */
  preparation?: LeadRequestPreparation;
}

export interface StructuredAiResponse<TOutput> {
  output: TOutput;
  modelVersion: string;
  promptVersion: string;
  latencyMs: number;
  warnings: string[];
  providerRequestId?: string;
  attempts?: number;
  retries?: number;
  requestedModelVersion?: string;
  actualProviderId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cachedPromptTokens?: number;
    accountCashCostUsd?: number;
  };
}

export interface AiProvider {
  readonly id: string;
  /** Exact wire bytes (or maximum across approved routes); pure preflight, no transport or credentials. */
  requestBytes?(request: StructuredAiRequest<unknown>): number;
  /** Exact primary-route wire contract; absence disables persisted result reuse. Never returns secrets. */
  cacheIdentity?(request:StructuredAiRequest<unknown>):string;
  /** Exact primary-route paid HTTP replay identity, excluding credentials. */
  paidRequestFingerprint?(request:StructuredAiRequest<unknown>):string;
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
  constructor(
    readonly providerId: string,
    cause?: unknown,
    readonly telemetry: { attempts?: number; retries?: number } = {},
  ) {
    super(`Provider ${providerId} is unavailable. The application must show an explicit degraded state.`);
    this.name = "ProviderUnavailableError";
    this.cause = cause;
  }
}
