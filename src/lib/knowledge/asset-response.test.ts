import {describe,expect,it} from "vitest";import {parseByteRange,safeDownloadName} from "./asset-response";import {safeKnowledgeStorageKey} from "./document-repository";
describe("knowledge asset boundaries",()=>{
  it("supports full, open and suffix byte ranges",()=>{expect(parseByteRange("bytes=0-9",100)).toEqual({start:0,end:9});expect(parseByteRange("bytes=90-",100)).toEqual({start:90,end:99});expect(parseByteRange("bytes=-10",100)).toEqual({start:90,end:99});});
  it("rejects traversal and absolute storage keys",()=>{expect(()=>safeKnowledgeStorageKey("knowledge/../secret.pdf")).toThrow();expect(()=>safeKnowledgeStorageKey("C:\\secret.pdf")).toThrow();expect(()=>safeKnowledgeStorageKey("knowledge/product/a.pdf")).not.toThrow();});
  it("sanitizes response filenames",()=>expect(safeDownloadName("bad\r\n/name",".pdf")).toBe("bad___name.pdf"));
  it("keeps a synthetic text asset extension",()=>expect(safeDownloadName("saved-text",".txt")).toBe("saved-text.txt"));
});
