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

export type KnowledgeBlockType = "heading"|"paragraph"|"table"|"table-row"|"list"|"note"|"pending-ocr";
export type ExtractionQuality = "success"|"blank"|"pending-ocr"|"failed";
export interface StructuredKnowledgeBlock {
  id: string; assetId?: string; unitType: "page"|"slide"|"sheet"|"document"; unitIndex: number;
  section?: string; blockType: KnowledgeBlockType; text: string; headingPath?: string[];
  table?: { headers: string[]; rows: string[][]; footnotes?: string[]; startRow?: number };
  bbox?: [number,number,number,number]; extractorVersion: string; quality: ExtractionQuality;
}
export interface TextChunkV2 extends TextChunk {
  parentKey: string; blockType: KnowledgeBlockType; sourceLocation: {unitType:StructuredKnowledgeBlock["unitType"];unitIndex:number;rowStart?:number;rowEnd?:number};
  normalizedText?: string;
}

export interface RetrievalFilters {
  collections?: KnowledgeBaseType[];
  market?: string;
  companyId?: string;
  productId?: string;
  minAuthority?: number;
  /** Canonical catalog terms used by the structured product retrieval lane. */
  structuredProductTerms?: string[];
  /** Controlled lexical expansion generated from the versioned attribute registry. */
  lexicalQuery?: string;
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
  /** Retrieval ordering score; it is not an answer-confidence probability. */
  rankingScore?: number;
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
  releaseId?: string;
  sourceLocation?: Record<string, unknown>;
  laneRanks?: { facts: number | null; fulltext: number | null; qwen: number | null; bge: number | null };
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
  grounded: boolean;
  model: string;
  latencyMs: number;
  warnings: string[];
  degradedLanes?: Array<"qwen" | "bge">;
  generationUsed?: boolean;
  externalDisclosure?: { excludedChunks: number; redactedPatterns: number };
  cache?: { embeddingHit: boolean; evidenceHit: boolean };
  kind?: "document-links" | "fact-answer" | "generated-answer" | "clarification" | "insufficient-evidence" | "unavailable";
  reasonCode?: string;
  documents?: Array<{
    assetId: string;
    title: string;
    documentType: string;
    version?: string;
    mimeType: string;
    url: string;
    page?: number;
  }>;
  factCitations?: Array<{
    factId: string;
    attributeKey: string;
    assetId: string;
    version?: string;
    status: string;
    rawValue: string;
  }>;
  comparison?: import("@/lib/knowledge/response").KnowledgeComparison;
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
  release?: {
    id: string; key: string; status: string; active: boolean;
    registeredAssets: number; completeAssets: number; chunks: number;
    qwenEmbeddings: number; bgeEmbeddings: number; openReviews: number;
    ocrReviews: number; candidateFacts: number; conflictFacts: number;
  };
  error?: string;
}
