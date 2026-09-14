import type {StructuredAiRequest} from "@/providers/contracts";
import {leadRequestByteLimit} from "@/providers/lead-request-bounds";

type PhaseScreening={
  factColumns:string[];factRows:unknown[][];sourceColumns:string[];sourceRows:unknown[][];
  sourceReferenceEncoding?:string;
  [key:string]:unknown;
};

/** Retain exact source identities while repeated fact citations address source rows. */
export function compactQualificationPhaseReferences<T extends StructuredAiRequest<unknown>>(
  request:T,requestBytes:(value:StructuredAiRequest<unknown>)=>number):T{
  if(request.task!=="lead-qualification")return request;
  const limit=leadRequestByteLimit(request);
  if(limit===null||requestBytes(request)<=limit)return request;
  const input=request.input as {phaseScreening?:PhaseScreening;instructions?:string[]}|null;
  const screening=input?.phaseScreening;
  if(!screening||screening.sourceReferenceEncoding||!Array.isArray(input?.instructions))return request;
  const sourceIdColumn=screening.sourceColumns.indexOf("evidenceId");
  const factEvidenceColumn=screening.factColumns.indexOf("evidenceIds");
  const citedEvidenceColumn=screening.factColumns.indexOf("phaseCitedEvidenceIds");
  if(sourceIdColumn<0||factEvidenceColumn<0||citedEvidenceColumn<0)return request;
  const sourceIds=screening.sourceRows.map(row=>row[sourceIdColumn]);
  if(sourceIds.some(id=>typeof id!=="string"||!id)||new Set(sourceIds).size!==sourceIds.length)
    throw new Error("Phased score source identities are incomplete or duplicated");
  const indexById=new Map(sourceIds.map((id,index)=>[id as string,index]));
  const rows=screening.factRows.map(row=>{
    const copy=[...row];
    for(const column of [factEvidenceColumn,citedEvidenceColumn]){
      if(!Array.isArray(copy[column]))throw new Error("Phased score citation list is invalid");
      copy[column]=(copy[column] as unknown[]).map(id=>{
        const index=typeof id==="string"?indexById.get(id):undefined;
        if(index===undefined)throw new Error("Phased score citation has no source row");
        return index;
      });
    }
    return copy;
  });
  const prepared={...request,input:{...input,
    instructions:[...input.instructions,
      "Phase source-row index encoding: evidenceIds and phaseCitedEvidenceIds in factRows are zero-based indexes into sourceRows. Resolve each index to sourceRows[index][evidenceId] before evaluating or citing. Return only the original evidence ID strings in the assessment. Source rows retain every exact source ID and type; indexes are not evidence or independent corroboration."],
    phaseScreening:{...screening,sourceReferenceEncoding:"source-row-index-v1",factRows:rows}}} as T;
  const before=requestBytes(request),after=requestBytes(prepared);
  if(after>=before)return request;
  return {...prepared,preparation:{
    encoding:[request.preparation?.encoding,"source-row-index-v1"].filter(Boolean).join("+"),
    originalMaximumWireBytes:request.preparation?.originalMaximumWireBytes??before,
    preparedMaximumWireBytes:after,
    evidenceItems:sourceIds.length,findingItems:rows.length,
  }};
}
