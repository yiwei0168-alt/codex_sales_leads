import { describe, expect, it } from "vitest";
import { chunkDocument, sha256 } from "./chunker";

describe("knowledge chunker", () => {
  it("preserves markdown heading paths", () => {
    const chunks = chunkDocument(`# Industry\n\n${"渠道模型内容。".repeat(30)}\n\n## ISP\n\n${"ISP 属于下级渠道。".repeat(30)}`, { maxCharacters: 300, minCharacters: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].headingPath).toEqual(["Industry"]);
    expect(chunks.some((chunk) => chunk.headingPath.join("/") === "Industry/ISP")).toBe(true);
  });

  it("is deterministic and creates bounded overlapping chunks", () => {
    const input = `# Product\n\n${"This specification requires formal approval. ".repeat(80)}`;
    const first = chunkDocument(input, { maxCharacters: 320, overlapCharacters: 50 });
    const second = chunkDocument(input, { maxCharacters: 320, overlapCharacters: 50 });
    expect(first).toEqual(second);
    expect(first.every((chunk) => chunk.content.length <= 420)).toBe(true);
    expect(first.every((chunk) => chunk.contentSha256 === sha256(chunk.content))).toBe(true);
  });

  it("does not emit empty chunks", () => {
    expect(chunkDocument("\n\n# Empty\n\n")).toEqual([]);
  });
});
