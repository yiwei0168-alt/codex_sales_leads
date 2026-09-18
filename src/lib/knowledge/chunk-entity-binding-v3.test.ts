import { describe, expect, it } from "vitest";
import { findExactModelEntities } from "./chunk-entity-binding-v3";

const entities = [
  { entityId: "wr3000", canonicalKey: "WR3000", displayName: "WR3000" },
  { entityId: "wr3000h", canonicalKey: "WR3000H", displayName: "WR3000H" },
  { entityId: "p2", canonicalKey: "P2", displayName: "P2" },
];

describe("v3 chunk exact model binding", () => {
  it("binds separate exact model tokens", () => {
    expect(findExactModelEntities("Compare WR3000 vs WR3000H and P2.", entities))
      .toEqual(["wr3000", "wr3000h", "p2"]);
  });

  it("does not bind a shorter model inside a longer token", () => {
    expect(findExactModelEntities("WR3000H Pro and XP2A", entities)).toEqual(["wr3000h"]);
  });
});
