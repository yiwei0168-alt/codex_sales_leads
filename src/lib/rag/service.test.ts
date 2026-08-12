import { describe, expect, it } from "vitest";
import { extractCitedChunkIds } from "./service";

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
});
