export type KnowledgeBaseType = "industry" | "company" | "product";
export type KnowledgeVisibility = "shared" | "private";

export interface KnowledgeDocumentInput {
  collection: KnowledgeBaseType;
  externalId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  sourceType: string;
  authorityLevel: 1 | 2 | 3 | 4 | 5;
  language?: string;
  market?: string;
  companyId?: string;
  productId?: string;
  capturedAt?: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
  visibility?: KnowledgeVisibility;
}

export interface TextChunk {
  index: number;
  headingPath: string[];
  content: string;
  tokenEstimate: number;
  contentSha256: string;
}

export interface RetrievalFilters {
  collections?: KnowledgeBaseType[];
  market?: string;
  companyId?: string;
  productId?: string;
  minAuthority?: number;
  /** Canonical catalog terms used by the structured product retrieval lane. */
  structuredProductTerms?: string[];
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  collection: KnowledgeBaseType;
  title: string;
  content: string;
  sourceUrl?: string;
  sourceType: string;
  authorityLevel: number;
  capturedAt?: string;
  headingPath: string[];
  vectorRank?: number;
  keywordRank?: number;
  structuredRank?: number;
  retrievalSignals: Array<"vector" | "keyword" | "structured">;
  corroborated: boolean;
  score: number;
  metadata: Record<string, unknown>;
  visibility: KnowledgeVisibility;
}

export interface RagQuery {
  question: string;
  filters?: RetrievalFilters;
  maxChunks?: number;
}

export interface RagCitation {
  chunkId: string;
  documentTitle: string;
  sourceUrl?: string;
  excerpt: string;
  score: number;
  collection: KnowledgeBaseType;
  visibility: KnowledgeVisibility;
  retrievalSignals: Array<"vector" | "keyword" | "structured">;
  corroborated: boolean;
  structuredFacts: Array<{ model: string; factKey: string; factValue: string; status: string }>;
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
  grounded: boolean;
  model: string;
  latencyMs: number;
  warnings: string[];
}

export interface KnowledgeStats {
  configured: boolean;
  provider: string;
  collections: Array<{
    type: KnowledgeBaseType;
    documentCount: number;
    chunkCount: number;
    embeddedCount: number;
    lastUpdated?: string;
  }>;
  error?: string;
}
