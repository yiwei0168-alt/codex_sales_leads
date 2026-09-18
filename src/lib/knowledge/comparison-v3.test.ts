import { describe, expect, it } from "vitest";
import { comparisonValue } from "./graph";
import type { ResolvedKnowledgeFact } from "./fact-repository";

const fact=(overrides:Partial<ResolvedKnowledgeFact>={}):ResolvedKnowledgeFact=>({
  id:"fact",attributeKey:"ethernet_port_count",typedValue:4,rawValue:"4 x Gigabit Ethernet Ports",
  unit:"port",polarity:"positive",status:"verified",assetId:"asset",documentVersion:"2.0",
  releaseId:"release",chunkId:"chunk",sourceLocation:{unitType:"page",unitIndex:3},...overrides,
});

describe("v3 comparison value states",()=>{
  it("keeps exact citations on verified values",()=>expect(comparisonValue([fact()])).toMatchObject({status:"verified",value:4,unit:"port",citations:[{releaseId:"release",chunkId:"chunk",sourceLocation:{unitType:"page",unitIndex:3}}]}));
  it("does not promote candidate OCR evidence",()=>expect(comparisonValue([fact({status:"candidate"})]).status).toBe("candidate"));
  it("marks distinct verified values as conflicting",()=>expect(comparisonValue([fact(),fact({id:"other",typedValue:5})]).status).toBe("conflicting"));
  it("represents absence as unknown rather than unsupported",()=>expect(comparisonValue([])).toEqual({status:"unknown",citations:[]}));
});
