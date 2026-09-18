import { describe, expect, it } from "vitest";

import { prepareRagExternalDisclosure } from "./external-disclosure";
import type { RetrievedChunk } from "./types";

function chunk(sourceType:string,content:string):RetrievedChunk{
  return {id:`chunk-${sourceType}`,documentId:`document-${sourceType}`,collection:"product",title:"Fixture",content,
    sourceType,authorityLevel:5,headingPath:[],retrievalSignals:["vector"],corroborated:false,score:0.8,
    metadata:{},visibility:"shared"};
}

describe("prepareRagExternalDisclosure",()=>{
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
