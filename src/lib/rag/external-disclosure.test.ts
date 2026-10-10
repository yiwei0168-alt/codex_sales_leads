import { describe, expect, it } from "vitest";

import { prepareRagExternalDisclosure } from "./external-disclosure";
import type { RetrievedChunk } from "./types";

function chunk(sourceType:string,content:string):RetrievedChunk{
  return {id:`chunk-${sourceType}`,documentId:`document-${sourceType}`,collection:"product",title:"Fixture",content,
    sourceType,authorityLevel:5,headingPath:[],retrievalSignals:["vector"],corroborated:false,score:0.8,
    metadata:{},visibility:"shared"};
}

describe("prepareRagExternalDisclosure",()=>{
  it("preserves only system UUID locators while still redacting sensitive source text",()=>{
    const id="11111111-1111-4111-8111-111111111111";
    const sourceUrl=`/api/knowledge/assets/${id}`;
    const source={...chunk("public-product-datasheet",`Card 4111 1111 1111 1111; ${id}`),id,sourceUrl};
    const result=prepareRagExternalDisclosure("password=hidden",[source]);
    expect(result.chunks[0].id).toBe(id);expect(result.chunks[0].sourceUrl).toBe(sourceUrl);
    expect(result.chunks[0].content).not.toContain("4111 1111 1111 1111");
    expect(result.chunks[0].content).not.toContain(id);expect(result.question).not.toContain("hidden");
    expect(prepareRagExternalDisclosure("Question",result.chunks).chunks[0].id).toBe(id);
  });
  it("keeps explicitly public knowledge, redacts sensitive patterns and excludes internal material",()=>{
    const disclosure=prepareRagExternalDisclosure("Compare products; email buyer@example.com",[
      chunk("public-product-datasheet","Public router facts. Phone +49 30 12345678."),
      chunk("internal-training-material","Confidential positioning."),
      chunk("private-mailbox-approved","Private customer message."),
    ]);
    expect(disclosure.chunks).toHaveLength(1);
    expect(disclosure.excludedChunks).toBe(2);
    expect(disclosure.redactionCount).toBe(2);
    expect(JSON.stringify(disclosure)).not.toMatch(/buyer@example|12345678|Confidential|customer message/);
  });

  it("does not treat access visibility alone as public provenance",()=>{
    expect(prepareRagExternalDisclosure("Question",[chunk("maintained-file","Internal")]).chunks).toEqual([]);
  });
});
