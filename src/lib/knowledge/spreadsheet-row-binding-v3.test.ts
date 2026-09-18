import { describe, expect, it } from "vitest";
import { buildRowScopedSpreadsheetChunks } from "./spreadsheet-row-binding-v3";

const rows = [
  { sheetIndex: 1, sheetName: "Price List", rowIndex: 4, cells: [
    { columnIndex: 1, value: "Model No." }, { columnIndex: 2, value: "Product name" }, { columnIndex: 3, value: "Description" },
  ] },
  { sheetIndex: 1, sheetName: "Price List", rowIndex: 20, cells: [
    { columnIndex: 1, value: "FS108D  V5.0" }, { columnIndex: 2, value: "Switch" }, { columnIndex: 3, value: "Eight ports" },
  ] },
  { sheetIndex: 1, sheetName: "Price List", rowIndex: 21, cells: [
    { columnIndex: 1, value: "WR3000" }, { columnIndex: 2, value: "Router" },
  ] },
];

describe("v3 spreadsheet row entity binding", () => {
  it("normalizes whitespace but binds only the exact model row", () => {
    const chunks = buildRowScopedSpreadsheetChunks({
      title: "Switch catalog", documentVersion: "2026-09",
      rows, entities: [{ entityId: "fs", canonicalKey: "FS108D V5.0", displayName: "FS108D V5.0" }],
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].rowStart).toBe(20);
    expect(chunks[0].entityIds).toEqual(["fs"]);
    expect(chunks[0].content).toContain("Description: Eight ports");
    expect(chunks[0].content).not.toContain("WR3000");
  });

  it("fails closed when a registered entity has no source row", () => {
    expect(() => buildRowScopedSpreadsheetChunks({
      title: "Missing", documentVersion: null, rows,
      entities: [{ entityId: "missing", canonicalKey: "MISSING", displayName: "Missing" }],
    })).toThrow("missing registered entities");
  });
});
