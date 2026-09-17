import { describe,expect,it } from "vitest";
import { MAX_KNOWLEDGE_BINARY_BYTES,validateKnowledgeBinary } from "./upload";

describe("knowledge binary upload validation",()=>{
  it("accepts a signed PDF without reading it as text",()=>{
    expect(validateKnowledgeBinary({originalFilename:"guide.pdf",mimeType:"application/pdf",bytes:Buffer.from("%PDF-1.7\nfixture")}))
      .toMatchObject({extension:".pdf",documentType:"PDF",mimeType:"application/pdf"});
  });
  it.each([["deck.pptx","ppt/"],["table.xlsx","xl/"]])("accepts the matching OOXML container %s",(name,marker)=>{
    const bytes=Buffer.from(`PK fixture [Content_Types].xml ${marker}`);
    expect(validateKnowledgeBinary({originalFilename:name,mimeType:"application/octet-stream",bytes}).name).toBe(name);
  });
  it("rejects traversal, mismatched containers and oversized files",()=>{
    expect(()=>validateKnowledgeBinary({originalFilename:"../guide.pdf",mimeType:"application/pdf",bytes:Buffer.from("%PDF-")})).toThrow();
    expect(()=>validateKnowledgeBinary({originalFilename:"deck.pptx",mimeType:"application/octet-stream",bytes:Buffer.from("PK [Content_Types].xml xl/")})).toThrow();
    expect(()=>validateKnowledgeBinary({originalFilename:"guide.pdf",mimeType:"application/pdf",bytes:new Uint8Array(MAX_KNOWLEDGE_BINARY_BYTES+1)})).toThrow();
  });
});
