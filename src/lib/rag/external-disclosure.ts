import { preparePublicReviewDisclosure } from "@/lib/leads/workflow/public-review-disclosure";
import type { RetrievedChunk } from "./types";

export interface RagExternalDisclosure {
  question: string;
  chunks: RetrievedChunk[];
  excludedChunks: number;
  redactionCount: number;
}

const PUBLIC_SOURCE_TYPES = new Set([
  "public-product-datasheet",
  "public-url-import",
  "official-website",
  "official-platform-profile",
  "independent-public",
]);

export function isPublicRagSource(chunk: RetrievedChunk): boolean {
  return chunk.sourceType.startsWith("public-") || PUBLIC_SOURCE_TYPES.has(chunk.sourceType);
}

/** A30 boundary: only explicitly public-source knowledge may enter an external RAG answer request. */
export function prepareRagExternalDisclosure(question: string, chunks: RetrievedChunk[]): RagExternalDisclosure {
  const selected = chunks.filter(isPublicRagSource);
  const disclosure = preparePublicReviewDisclosure({ question, chunks: selected });
  return {
    ...disclosure.value,
    excludedChunks: chunks.length - selected.length,
    redactionCount: Object.values(disclosure.redactionCounts).reduce((sum, count) => sum + count, 0),
  };
}
