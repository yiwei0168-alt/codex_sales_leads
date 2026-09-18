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
    bindingMethod?: "registered-document-entity" | "datasheet-title-exact-normalized";
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

export type ManifestProductEntity = {
  entityId: string;
  canonicalKey: string;
  displayName: string;
};

const normalizeExactModel = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();

export function attachExactDatasheetEntities(
  rows: RegisteredAssetBinding[],
  catalog: ManifestProductEntity[],
): { rows: RegisteredAssetBinding[]; inferredBindings: number } {
  const byExactName = new Map<string, ManifestProductEntity[]>();
  for (const entity of catalog) {
    for (const value of new Set([entity.canonicalKey, entity.displayName])) {
      const key = normalizeExactModel(value);
      byExactName.set(key, [...(byExactName.get(key) ?? []), entity]);
    }
  }
  let inferredBindings = 0;
  const enriched = rows.map((row) => {
    if (row.entities.length || !/datasheet/i.test(`${row.title} ${row.storageKey}`)) return row;
    const match = row.title.match(/^(.+?)\s+Datasheet(?:\s+(?:V?[0-9]|Unknown)|$)/i);
    if (!match || normalizeExactModel(match[1]) === "CUDY") return row;
    const matches = byExactName.get(normalizeExactModel(match[1])) ?? [];
    const unique = [...new Map(matches.map((entity) => [entity.entityId, entity])).values()];
    if (unique.length !== 1) return row;
    inferredBindings++;
    return {
      ...row,
      entities: [{ ...unique[0], entityType: "product" as const, relationType: "about" as const,
        bindingMethod: "datasheet-title-exact-normalized" as const }],
    };
  });
  return { rows: enriched, inferredBindings };
}

export function assertManifestScope(rows: RegisteredAssetBinding[], sources: PhysicalSourceManifest[]): void {
  const assetIds = rows.map((row) => row.assetId);
  if (assetIds.length !== new Set(assetIds).size) throw new Error("Registered asset query returned duplicate asset rows");
  const manifested = sources.flatMap((source) => source.bindings.map((binding) => binding.assetId));
  if (manifested.length !== assetIds.length || new Set(manifested).size !== assetIds.length) {
    throw new Error("Physical source manifest must contain every registered asset exactly once");
  }
}
