import { describe, expect, it } from "vitest";
import { attachExactDatasheetEntities, type RegisteredAssetBinding } from "./manifest-v3";

const row = (title: string, storageKey: string): RegisteredAssetBinding => ({
  assetId: "asset", documentId: "document", visibility: "shared", ownerId: "owner", title, storageKey,
  sourceSha256: "a".repeat(64), byteSize: "1", mimeType: "application/pdf", documentType: "PDF",
  documentVersion: null, market: null, language: "en", sourceNature: "official-product-datasheet",
  externallyDisclosable: true, entities: [],
});

describe("v3 manifest exact datasheet entity inference", () => {
  const catalog = [{ entityId: "gs", canonicalKey: "GS2018PS2", displayName: "GS2018PS2" }];

  it("binds an exact datasheet title model", () => {
    const result = attachExactDatasheetEntities([row("GS2018PS2 Datasheet V1.0", "knowledge/GS2018PS2.pdf")], catalog);
    expect(result.inferredBindings).toBe(1);
    expect(result.rows[0].entities[0]).toMatchObject({ entityId: "gs", bindingMethod: "datasheet-title-exact-normalized" });
  });

  it("does not bind presentations, generic Cudy covers, or partial models", () => {
    const result = attachExactDatasheetEntities([
      row("GS2018PS2 Product Training", "knowledge/training.pptx"),
      row("Cudy Datasheet Unknown", "knowledge/Cudy_catalog.pdf"),
      row("GS2018 Datasheet V1.0", "knowledge/GS2018.pdf"),
    ], catalog);
    expect(result.inferredBindings).toBe(0);
    expect(result.rows.every((item) => item.entities.length === 0)).toBe(true);
  });
});
