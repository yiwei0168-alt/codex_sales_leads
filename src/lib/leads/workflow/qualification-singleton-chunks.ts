import {createHash} from "node:crypto";
import {z} from "zod";

import type {StructuredAiRequest} from "@/providers/contracts";
import {LeadRequestTooLargeError,leadRequestByteLimit} from "@/providers/lead-request-bounds";

export const QUALIFICATION_SINGLETON_CHUNK_VERSION="qualification-singleton-chunk-v1";
export const qualificationSingletonChunkOutputSchema=z.strictObject({
  unitKind:z.enum(["finding","evidence"]),unitId:z.string().min(1),
  chunkIndex:z.number().int().nonnegative(),
  materiality:z.enum(["material","context","uncertain"]),
  summary:z.string().trim().min(1).max(240),
  citedEvidenceIds:z.array(z.string().min(1)),
});
export type QualificationSingletonChunkOutput=z.infer<typeof qualificationSingletonChunkOutputSchema>;
const outputJsonSchema=z.toJSONSchema(qualificationSingletonChunkOutputSchema) as Record<string,unknown>;

export interface QualificationSingletonUnit {
  kind:"finding"|"evidence";
  id:string;
  text:string;
  evidenceIds:string[];
}

/** Pure exact-wire planner. It preserves every code point and every original citation identity. */
export function planQualificationSingletonChunks(options:{candidateId:string;countryCode:string;countryName:string;
  objective:string;sourceFingerprint:string;modelVersion:string;dataClassification:"public"|"private-workspace";
  tenantScope?:string;
  unit:QualificationSingletonUnit;requestBytes:(request:StructuredAiRequest<unknown>)=>number}){
  const {candidateId,countryCode,countryName,objective,sourceFingerprint,modelVersion,dataClassification,tenantScope,
    unit,requestBytes}=options;
  if(!candidateId.trim()||!/^[A-Z]{2}$/.test(countryCode)||!countryName.trim()||!objective.trim()
    ||!modelVersion.trim()||!sourceFingerprint.match(/^[a-f0-9]{64}$/)
    ||(dataClassification==="private-workspace"&&!tenantScope?.trim())
    ||!unit.id.trim()||!unit.text.length||new Set(unit.evidenceIds).size!==unit.evidenceIds.length
    ||unit.evidenceIds.some(id=>!id.trim())||(unit.kind==="evidence"
      &&(unit.evidenceIds.length!==1||unit.evidenceIds[0]!==unit.id)))
    throw new Error("Singleton chunk identity or citation closure is invalid");
  const points=Array.from(unit.text),contentSha256=createHash("sha256").update(unit.text).digest("hex");
  // Namespace chunk checkpoints away from ordinary fact phases and other long units.
  const checkpointFingerprint=createHash("sha256").update(JSON.stringify({
    version:QUALIFICATION_SINGLETON_CHUNK_VERSION,candidateSourceFingerprint:sourceFingerprint,
    unitKind:unit.kind,unitId:unit.id,contentSha256})).digest("hex");
  const build=(excerpt:string,chunkIndex:number,chunkCount:number,startCodePoint:number,endCodePoint:number):StructuredAiRequest<unknown>=>({
    task:"lead-qualification",modelVersion,promptVersion:QUALIFICATION_SINGLETON_CHUNK_VERSION,
    dataClassification,tenantScope,evidenceIds:[...unit.evidenceIds],outputSchema:outputJsonSchema,
    input:{candidateId,market:{countryCode,countryName,objective},sourceFingerprint:checkpointFingerprint,
      candidateSourceFingerprint:sourceFingerprint,
      unitKind:unit.kind,unitId:unit.id,contentSha256,chunkIndex,chunkCount,startCodePoint,endCodePoint,
      excerpt,evidenceIds:[...unit.evidenceIds],instructions:[
        "Screen only this exact segment of one oversized fact or source. This is not a final eligibility or score decision.",
        "Return the supplied unit kind, ID and chunk index. Cite only supplied original evidence IDs.",
        "Preserve uncertainty, negative evidence and conflict. A partial segment cannot corroborate an entire source or upgrade an eligibility gate.",
        "Summarize material details in at most 240 characters. Mark uncertain when the segment cannot establish materiality without other segments.",
      ]},
  });
  const limit=Math.min(leadRequestByteLimit(build("x",0,1,0,1))??Number.POSITIVE_INFINITY,57_344);
  const reserved=Number.MAX_SAFE_INTEGER;
  const chunks:Array<{start:number;end:number;text:string}>=[];
  for(let start=0;start<points.length;){
    let low=1,high=points.length-start,best=0;
    while(low<=high){
      const size=Math.floor((low+high)/2);
      const probe=build(points.slice(start,start+size).join(""),reserved,reserved,reserved,reserved);
      if(requestBytes(probe)<=limit){best=size;low=size+1;}else high=size-1;
    }
    if(!best){
      const bytes=requestBytes(build(points[start],reserved,reserved,reserved,reserved));
      throw new LeadRequestTooLargeError(bytes,limit);
    }
    chunks.push({start,end:start+best,text:points.slice(start,start+best).join("")});
    start+=best;
  }
  const requests=chunks.map((chunk,index)=>build(chunk.text,index,chunks.length,chunk.start,chunk.end));
  for(const request of requests){
    const bytes=requestBytes(request);
    if(bytes>limit)throw new LeadRequestTooLargeError(bytes,limit);
  }
  if(chunks.map(chunk=>chunk.text).join("")!==unit.text)throw new Error("Singleton chunk coverage differs");
  return {version:QUALIFICATION_SINGLETON_CHUNK_VERSION,contentSha256,
    candidateSourceFingerprint:sourceFingerprint,checkpointFingerprint,
    codePointCount:points.length,requests};
}

/** Completed chunk output must match the purchased request and original citation closure. */
export function validateQualificationSingletonChunkOutput(request:StructuredAiRequest<unknown>,output:unknown){
  if(request.task!=="lead-qualification"||request.promptVersion!==QUALIFICATION_SINGLETON_CHUNK_VERSION)
    throw new Error("Not a singleton qualification chunk request");
  const parsed=qualificationSingletonChunkOutputSchema.parse(output);
  const input=request.input as {unitKind?:unknown;unitId?:unknown;chunkIndex?:unknown;chunkCount?:unknown;
    startCodePoint?:unknown;endCodePoint?:unknown;excerpt?:unknown;contentSha256?:unknown;
    sourceFingerprint?:unknown;candidateSourceFingerprint?:unknown;evidenceIds?:unknown}|null;
  const allowed=Array.isArray(input?.evidenceIds)?input.evidenceIds:[];
  if(parsed.unitKind!==input?.unitKind||parsed.unitId!==input?.unitId||parsed.chunkIndex!==input?.chunkIndex
    ||!Number.isSafeInteger(input?.chunkIndex)||!Number.isSafeInteger(input?.chunkCount)
    ||(input!.chunkIndex as number)<0||(input!.chunkIndex as number)>=(input!.chunkCount as number)
    ||!Number.isSafeInteger(input?.startCodePoint)||!Number.isSafeInteger(input?.endCodePoint)
    ||(input!.startCodePoint as number)<0||(input!.endCodePoint as number)<=(input!.startCodePoint as number)
    ||typeof input?.excerpt!=="string"
    ||Array.from(input.excerpt).length!==(input.endCodePoint as number)-(input.startCodePoint as number)
    ||typeof input?.contentSha256!=="string"||!/^[a-f0-9]{64}$/.test(input.contentSha256)
    ||typeof input?.sourceFingerprint!=="string"||!/^[a-f0-9]{64}$/.test(input.sourceFingerprint)
    ||typeof input?.candidateSourceFingerprint!=="string"
    ||!/^[a-f0-9]{64}$/.test(input.candidateSourceFingerprint)
    ||input.sourceFingerprint!==createHash("sha256").update(JSON.stringify({
      version:QUALIFICATION_SINGLETON_CHUNK_VERSION,candidateSourceFingerprint:input.candidateSourceFingerprint,
      unitKind:parsed.unitKind,unitId:parsed.unitId,contentSha256:input.contentSha256})).digest("hex")
    ||allowed.length!==request.evidenceIds.length||allowed.some((id,index)=>id!==request.evidenceIds[index])
    ||new Set(parsed.citedEvidenceIds).size!==parsed.citedEvidenceIds.length
    ||parsed.citedEvidenceIds.some(id=>!allowed.includes(id))
    ||(parsed.materiality==="material"&&parsed.citedEvidenceIds.length===0))
    throw new Error("Singleton chunk output identity or citation closure differs");
  return parsed;
}
