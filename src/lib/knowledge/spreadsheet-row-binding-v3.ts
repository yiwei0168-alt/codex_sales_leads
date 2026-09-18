import { createHash } from "node:crypto";

export type SpreadsheetArtifactRow = {
  sheetIndex: number;
  sheetName: string;
  rowIndex: number;
  cells: Array<{ columnIndex: number; value: string }>;
};

export type SpreadsheetEntity = { entityId: string; canonicalKey: string; displayName: string };

export type RowScopedChunk = {
  index: number;
  headingPath: string[];
  unitType: "sheet";
  unitIndex: number;
  content: string;
  canonicalEmbeddingText: string;
  tokenEstimate: number;
  contentSha256: string;
  evidenceStatus: "parsed";
  blockType: "table-row";
  rowStart: number;
  rowEnd: number;
  sheetName: string;
  entityIds: string[];
  bindingMethod: "xlsx-model-cell-exact-normalized";
};

export const normalizeSpreadsheetModel = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function buildRowScopedSpreadsheetChunks(input: {
  title: string;
  documentVersion: string | null;
  rows: SpreadsheetArtifactRow[];
  entities: SpreadsheetEntity[];
}): RowScopedChunk[] {
  const entities = new Map(input.entities.map((entity) => [normalizeSpreadsheetModel(entity.canonicalKey), entity]));
  if (entities.size !== input.entities.length) throw new Error(`Duplicate normalized entity key for ${input.title}`);
  const headers = input.rows.find((row) => normalizeSpreadsheetModel(row.cells.find((cell) => cell.columnIndex === 1)?.value ?? "") === "model no.");
  const headerByColumn = new Map(headers?.cells.map((cell) => [cell.columnIndex, cell.value]) ?? []);
  const matched = new Set<string>();
  const built: RowScopedChunk[] = [];
  for (const row of input.rows) {
    const modelCell = row.cells.find((cell) => cell.columnIndex === 1);
    const entity = modelCell ? entities.get(normalizeSpreadsheetModel(modelCell.value)) : undefined;
    if (!entity) continue;
    if (matched.has(entity.entityId)) throw new Error(`Entity ${entity.canonicalKey} matches more than one spreadsheet row`);
    const content = row.cells.map((cell) => `${headerByColumn.get(cell.columnIndex) ?? `Column ${cell.columnIndex}`}: ${cell.value}`).join("\n");
    built.push({
      index: built.length, headingPath: [input.title, row.sheetName, entity.displayName],
      unitType: "sheet", unitIndex: row.sheetIndex, content,
      canonicalEmbeddingText: [input.title, input.documentVersion, content].filter(Boolean).join("\n"),
      tokenEstimate: Math.ceil(content.length / 4),
      contentSha256: createHash("sha256").update(content).digest("hex"), evidenceStatus: "parsed",
      blockType: "table-row", rowStart: row.rowIndex, rowEnd: row.rowIndex, sheetName: row.sheetName,
      entityIds: [entity.entityId], bindingMethod: "xlsx-model-cell-exact-normalized",
    });
    matched.add(entity.entityId);
  }
  const missing = input.entities.filter((entity) => !matched.has(entity.entityId));
  if (missing.length) throw new Error(`Catalog rows missing registered entities for ${input.title}: ${missing.map((item) => item.canonicalKey).join(", ")}`);
  return built;
}
