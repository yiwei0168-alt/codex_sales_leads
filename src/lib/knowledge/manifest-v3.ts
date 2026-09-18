export type RegisteredAssetBinding = {
  assetId: string;
  documentId: string;
  visibility: "shared" | "private";
  ownerId: string;
  title: string;
  storageKey: string;
  sourceSha256: string;
  byteSize: string;
  mimeType: string;
  documentType: string;
  documentVersion: string | null;
  market: string | null;
  language: string | null;
  sourceNature: string;
  externallyDisclosable: boolean;
  entities: Array<{
    entityId: string;
    entityType: "product" | "company" | "industry-topic";
    canonicalKey: string;
    displayName: string;
    relationType: "about" | "applies-to" | "mentions";
  }>;
};

export type PhysicalSourceManifest = {
  storageKey: string;
  sourceSha256: string;
  byteSize: string;
  mimeType: string;
  bindingMode: "document-scoped-allowed" | "row-scoped-required";
  bindings: RegisteredAssetBinding[];
};

export function buildPhysicalSourceManifest(rows: RegisteredAssetBinding[]): PhysicalSourceManifest[] {
  const grouped = new Map<string, PhysicalSourceManifest>();
  for (const row of rows) {
    const key = `${row.storageKey}\u0000${row.sourceSha256}`;
    const current = grouped.get(key);
    if (current) {
      if (current.byteSize !== row.byteSize || current.mimeType !== row.mimeType) {
        throw new Error(`Physical source metadata disagrees for ${row.storageKey}`);
      }
      current.bindings.push(row);
    } else {
      grouped.set(key, {
        storageKey: row.storageKey,
        sourceSha256: row.sourceSha256,
        byteSize: row.byteSize,
        mimeType: row.mimeType,
        bindingMode: "document-scoped-allowed",
        bindings: [row],
      });
    }
  }
  return [...grouped.values()]
    .map((source) => ({
      ...source,
      bindingMode: source.bindings.length > 1 ? "row-scoped-required" as const : "document-scoped-allowed" as const,
      bindings: source.bindings.toSorted((left, right) => left.documentId.localeCompare(right.documentId)),
    }))
    .toSorted((left, right) => left.storageKey.localeCompare(right.storageKey));
}

export function assertManifestScope(rows: RegisteredAssetBinding[], sources: PhysicalSourceManifest[]): void {
  const assetIds = rows.map((row) => row.assetId);
  if (assetIds.length !== new Set(assetIds).size) throw new Error("Registered asset query returned duplicate asset rows");
  const manifested = sources.flatMap((source) => source.bindings.map((binding) => binding.assetId));
  if (manifested.length !== assetIds.length || new Set(manifested).size !== assetIds.length) {
    throw new Error("Physical source manifest must contain every registered asset exactly once");
  }
}
