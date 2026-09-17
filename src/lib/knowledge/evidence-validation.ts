import type { RetrievedChunk } from "@/lib/rag/types";

interface StructuredFactEvidence {
  model?: string;
  factKey?: string;
  status?: string;
}

export interface EvidenceValidationResult {
  grounded: boolean;
  citedChunks: RetrievedChunk[];
  unknownCitationIds: string[];
  reasons: Array<"empty-citations" | "unknown-citation" | "conflicting-fact" | "missing-verified-property" | "wrong-product">;
}

function structuredFacts(chunk: RetrievedChunk): StructuredFactEvidence[] {
  return Array.isArray(chunk.metadata.structuredFacts)
    ? chunk.metadata.structuredFacts as StructuredFactEvidence[]
    : [];
}

export function validateRagEvidence(input: {
  citedIds: ReadonlySet<string>;
  availableChunks: readonly RetrievedChunk[];
  expectedProductId?: string;
}): EvidenceValidationResult {
  const available = new Map(input.availableChunks.map((chunk) => [chunk.id.toLowerCase(), chunk]));
  const unknownCitationIds = [...input.citedIds].filter((id) => !available.has(id.toLowerCase()));
  const citedChunks = [...input.citedIds].flatMap((id) => {
    const chunk = available.get(id.toLowerCase());
    return chunk ? [chunk] : [];
  });
  const reasons: EvidenceValidationResult["reasons"] = [];

  if (input.citedIds.size === 0) reasons.push("empty-citations");
  if (unknownCitationIds.length > 0) reasons.push("unknown-citation");

  const citedProductChunks = citedChunks.filter((item) => item.collection === "product");
  if (input.expectedProductId && citedProductChunks.length === 0) reasons.push("missing-verified-property");
  for (const chunk of citedProductChunks) {
    const facts = structuredFacts(chunk);
    if (facts.some((fact) => fact.status === "conflicting")) reasons.push("conflicting-fact");
    const verifiedProperties = facts.filter((fact) => fact.status === "verified" && fact.factKey !== "catalog_identity");
    if (verifiedProperties.length === 0) reasons.push("missing-verified-property");
    if (input.expectedProductId && !verifiedProperties.some(
      (fact) => (fact.model ?? "").localeCompare(input.expectedProductId!, undefined, { sensitivity: "accent" }) === 0,
    )) reasons.push("wrong-product");
  }

  return {
    grounded: input.citedIds.size > 0 && reasons.length === 0,
    citedChunks,
    unknownCitationIds,
    reasons: [...new Set(reasons)],
  };
}
