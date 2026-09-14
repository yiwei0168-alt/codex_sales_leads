import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";

import {DeepSeekProvider} from "@/providers/deepseek";
import {LeadRequestTooLargeError} from "@/providers/lead-request-bounds";

import {planQualificationSingletonChunks,validateQualificationSingletonChunkOutput} from "./qualification-singleton-chunks";

describe("qualification singleton chunk preflight",()=>{
  const wire=new DeepSeekProvider({apiKey:"fixture-never-sent",maxAttempts:1,
    fetchImplementation:async()=>{throw new Error("No transport is permitted in chunk planning");}});
  const base={candidateId:"candidate-1",countryCode:"CO",countryName:"Colombia",
    objective:"new-market",sourceFingerprint:createHash("sha256").update("original-candidate").digest("hex"),
    modelVersion:"deepseek-v4-pro",dataClassification:"public" as const,
    requestBytes:(request:Parameters<typeof wire.requestBytes>[0])=>wire.requestBytes(request)};

  it("covers a long critical finding exactly with bounded real provider wires and original citations",()=>{
    const text="opening 🛰️ "+"甲β𝌆".repeat(40_000)+" closing disputed condition";
    const unit={kind:"finding" as const,id:"finding-critical",text,evidenceIds:["source-original"]};
    const planned=planQualificationSingletonChunks({...base,unit});
    expect(planned.requests.length).toBeGreaterThan(1);
    expect(planned.requests.every(request=>wire.requestBytes(request)<=57_344)).toBe(true);
    const inputs=planned.requests.map(request=>request.input as {excerpt:string;startCodePoint:number;
      endCodePoint:number;chunkIndex:number;chunkCount:number;contentSha256:string});
    expect(inputs.map(input=>input.excerpt).join("")).toBe(text);
    expect(inputs[0].startCodePoint).toBe(0);
    expect(inputs.at(-1)?.endCodePoint).toBe(Array.from(text).length);
    expect(inputs.every((input,index)=>input.chunkIndex===index&&input.chunkCount===inputs.length
      &&input.startCodePoint===(index?inputs[index-1].endCodePoint:0)
      &&input.contentSha256===planned.contentSha256)).toBe(true);
    expect(planned.requests.every(request=>request.evidenceIds[0]==="source-original")).toBe(true);
    const changed=planQualificationSingletonChunks({...base,unit:{...unit,
      text:text.slice(0,70_000)+"改"+text.slice(70_001)}});
    expect(changed.contentSha256).not.toBe(planned.contentSha256);
    expect(wire.cacheIdentity(changed.requests[0])).not.toBe(wire.cacheIdentity(planned.requests[0]));
    expect(wire.paidRequestFingerprint(changed.requests[0]))
      .not.toBe(wire.paidRequestFingerprint(planned.requests[0]));
  });

  it("rejects a swapped or uncited material segment before it can be used",()=>{
    const planned=planQualificationSingletonChunks({...base,unit:{kind:"evidence",id:"source-original",
      text:"A whole source may contain conflicting and negative material.",evidenceIds:["source-original"]}});
    const request=planned.requests[0];
    const output={unitKind:"evidence",unitId:"source-original",chunkIndex:0,
      materiality:"material",summary:"A stated conflict needs review.",citedEvidenceIds:["source-original"]};
    expect(validateQualificationSingletonChunkOutput(request,output)).toEqual(output);
    expect(()=>validateQualificationSingletonChunkOutput(request,{...output,chunkIndex:1})).toThrow();
    expect(()=>validateQualificationSingletonChunkOutput(request,{...output,citedEvidenceIds:["other"]})).toThrow();
    expect(()=>validateQualificationSingletonChunkOutput(request,{...output,citedEvidenceIds:[]})).toThrow();
    expect(()=>validateQualificationSingletonChunkOutput({...request,input:{...(request.input as object),
      endCodePoint:999}},output)).toThrow();
  });

  it("fails before transport when identities alone consume the byte contract",()=>{
    expect(()=>planQualificationSingletonChunks({...base,unit:{kind:"finding",id:"x".repeat(70_000),
      text:"critical",evidenceIds:["source-original"]}})).toThrow(LeadRequestTooLargeError);
  });

  it("requires private tenant scope without putting it into the provider wire identity",()=>{
    const unit={kind:"evidence" as const,id:"source-original",text:"private working context",
      evidenceIds:["source-original"]};
    expect(()=>planQualificationSingletonChunks({...base,dataClassification:"private-workspace",unit}))
      .toThrow("Singleton chunk identity");
    const first=planQualificationSingletonChunks({...base,dataClassification:"private-workspace",
      tenantScope:"workspace-one",unit});
    const second=planQualificationSingletonChunks({...base,dataClassification:"private-workspace",
      tenantScope:"workspace-two",unit});
    expect(first.requests[0].tenantScope).toBe("workspace-one");
    expect(second.requests[0].tenantScope).toBe("workspace-two");
    // Provider hashes describe the paid bytes; persistence must additionally key by tenant.
    expect(wire.cacheIdentity(first.requests[0])).toBe(wire.cacheIdentity(second.requests[0]));
    expect(wire.paidRequestFingerprint(first.requests[0]))
      .toBe(wire.paidRequestFingerprint(second.requests[0]));
  });
});
