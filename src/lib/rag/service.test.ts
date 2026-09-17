import { describe, expect, it } from "vitest";
import { extractCitedChunkIds } from "./service";
import { validateRagEvidence } from "@/lib/knowledge/evidence-validation";
import type { RetrievedChunk } from "./types";

const chunkId = "11111111-1111-4111-8111-111111111111";
function productChunk(facts: Array<{ model: string; factKey: string; factValue: string; status: string }>): RetrievedChunk {
  return {
    id: chunkId, documentId: "doc", collection: "product", title: "Source", content: "Evidence",
    sourceType: "public-product-datasheet", authorityLevel: 5, headingPath: [], visibility: "shared",
    retrievalSignals: ["structured", "keyword"], corroborated: true, score: 0.9,
    metadata: { structuredFacts: facts },
  };
}

describe("RAG citation validation", () => {
  it("extracts only full UUID chunk citations", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    const ids = extractCitedChunkIds(`Fact [KB:${first}] and support [KB:${second}]. Invalid [KB:short].`);
    expect([...ids]).toEqual([first, second]);
  });

  it("returns an empty set for ungrounded prose", () => {
    expect(extractCitedChunkIds("No citation here").size).toBe(0);
  });

  it("rejects well-formed citations absent from the supplied evidence", () => {
    const result = validateRagEvidence({
      citedIds: new Set(["22222222-2222-4222-8222-222222222222"]),
      availableChunks: [productChunk([{ model: "MODEL-A", factKey: "port_count", factValue: "4", status: "verified" }])],
    });
    expect(result.grounded).toBe(false);
    expect(result.reasons).toContain("unknown-citation");
  });

  it("rejects conflicting and identity-only evidence", () => {
    const conflicting = validateRagEvidence({
      citedIds: new Set([chunkId]),
      availableChunks: [productChunk([{ model: "MODEL-A", factKey: "port_count", factValue: "4", status: "conflicting" }])],
    });
    expect(conflicting.grounded).toBe(false);
    expect(conflicting.reasons).toContain("conflicting-fact");
    const identityOnly = validateRagEvidence({
      citedIds: new Set([chunkId]),
      availableChunks: [productChunk([{ model: "MODEL-A", factKey: "catalog_identity", factValue: "Example", status: "verified" }])],
    });
    expect(identityOnly.reasons).toContain("missing-verified-property");
  });

  it("requires verified product evidence to match the requested model", () => {
    const wrongModel = validateRagEvidence({
      citedIds: new Set([chunkId]), expectedProductId: "MODEL-B",
      availableChunks: [productChunk([{ model: "MODEL-A", factKey: "port_count", factValue: "4", status: "verified" }])],
    });
    expect(wrongModel.grounded).toBe(false);
    expect(wrongModel.reasons).toContain("wrong-product");
    const correctModel = validateRagEvidence({
      citedIds: new Set([chunkId]), expectedProductId: "model-a",
      availableChunks: [productChunk([{ model: "MODEL-A", factKey: "port_count", factValue: "4", status: "verified" }])],
    });
    expect(correctModel.grounded).toBe(true);
  });

  it("does not ground a product-scoped request with only non-product evidence", () => {
    const nonProduct = { ...productChunk([]), collection: "company" as const };
    const result = validateRagEvidence({
      citedIds: new Set([chunkId]), expectedProductId: "MODEL-A", availableChunks: [nonProduct],
    });
    expect(result.grounded).toBe(false);
    expect(result.reasons).toContain("missing-verified-property");
  });
});
