import { describe, expect, it } from "vitest";
import { assertManifestScope, buildPhysicalSourceManifest, type RegisteredAssetBinding } from "./manifest-v3";

function binding(overrides: Partial<RegisteredAssetBinding> = {}): RegisteredAssetBinding {
  return {
    assetId: "asset-1", documentId: "document-1", visibility: "shared", ownerId: "owner-1",
    title: "WR3000", storageKey: "knowledge/product/wr3000.pdf", sourceSha256: "a".repeat(64),
    byteSize: "10", mimeType: "application/pdf", documentType: "PDF", documentVersion: "1.0",
    market: null, language: "en", sourceNature: "official-datasheet", externallyDisclosable: true,
    entities: [], ...overrides,
  };
}

describe("RAG v3 physical source manifest", () => {
  it("deduplicates parsing while retaining every logical asset binding", () => {
    const rows = [binding(), binding({ assetId: "asset-2", documentId: "document-2" })];
    const sources = buildPhysicalSourceManifest(rows);
    assertManifestScope(rows, sources);
    expect(sources).toHaveLength(1);
    expect(sources[0].bindings).toHaveLength(2);
    expect(sources[0].bindingMode).toBe("row-scoped-required");
  });

  it("allows document-scoped binding only for a unique physical source", () => {
    const sources = buildPhysicalSourceManifest([binding()]);
    expect(sources[0].bindingMode).toBe("document-scoped-allowed");
  });

  it("rejects duplicate asset rows even if the physical grouping is stable", () => {
    const rows = [binding(), binding()];
    expect(() => assertManifestScope(rows, buildPhysicalSourceManifest(rows))).toThrow("duplicate asset rows");
  });
});
