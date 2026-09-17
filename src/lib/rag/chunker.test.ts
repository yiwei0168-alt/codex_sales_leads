import { describe, expect, it } from "vitest";
import { chunkDocument, chunkDocumentV2, sha256 } from "./chunker";

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

  it("keeps short sections with their own heading in v2",()=>{
    const chunks=chunkDocumentV2([{id:"a",unitType:"page",unitIndex:1,section:"Alpha",blockType:"paragraph",text:"Long alpha statement.",extractorVersion:"v2",quality:"success"},{id:"b",unitType:"page",unitIndex:1,section:"Beta",blockType:"paragraph",text:"Short beta fact.",extractorVersion:"v2",quality:"success"}]);
    expect(chunks.map(chunk=>chunk.headingPath)).toEqual([["Alpha"],["Beta"]]);
  });

  it("repeats table headers and footnotes when splitting row groups",()=>{
    const chunks=chunkDocumentV2([{id:"t",unitType:"sheet",unitIndex:1,section:"Ports",blockType:"table",text:"",table:{headers:["Model","Ports","Note"],rows:Array.from({length:30},(_,i)=>[`M${i}`,String(i),"not supported under condition with a deliberately long qualifier"]),footnotes:["* shared ports are not additive"]},extractorVersion:"v2",quality:"success"}],{maxTokens:300});
    expect(chunks.length).toBeGreaterThan(1);expect(chunks.every(chunk=>chunk.content.includes("Model | Ports | Note")&&chunk.content.includes("shared ports"))).toBe(true);
  });
});
