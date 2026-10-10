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
  // Only typed system locators bypass text redaction; UUID-looking text inside
  // content, titles, questions or metadata is still sanitized normally.
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const locators=selected.map(chunk=>({
    id:uuid.test(chunk.id)?chunk.id:undefined,
    sourceUrl:chunk.sourceUrl?.startsWith("/api/knowledge/assets/")
      &&uuid.test(chunk.sourceUrl.slice("/api/knowledge/assets/".length))?chunk.sourceUrl:undefined,
  }));
  const disclosure = preparePublicReviewDisclosure({ question, chunks: selected.map((chunk,index)=>({
    ...chunk,...(locators[index].id?{id:""}:{}),...(locators[index].sourceUrl?{sourceUrl:""}:{}),
  })) });
  disclosure.value.chunks=disclosure.value.chunks.map((chunk,index)=>({...chunk,
    ...(locators[index].id?{id:locators[index].id!}:{}),
    ...(locators[index].sourceUrl?{sourceUrl:locators[index].sourceUrl}:{}),
  }));
  return {
    ...disclosure.value,
    excludedChunks: chunks.length - selected.length,
    redactionCount: Object.values(disclosure.redactionCounts).reduce((sum, count) => sum + count, 0),
  };
}
