import {createHash} from "node:crypto";
import type {StructuredAiRequest} from "@/providers/contracts";
import {leadRequestByteLimit} from "@/providers/lead-request-bounds";

type PhaseFinding={kind:string;status:string;evidenceIds:string[]};
type PhaseEvidence={evidenceId:string;excerpt:string;[key:string]:unknown};
type PhaseInput={instructions:string[];candidate:{findings:PhaseFinding[];evidence:PhaseEvidence[]};
  evidenceExcerptEncoding?:string;foldedEvidenceIds?:string[];[key:string]:unknown};
const FOLDABLE_KINDS=new Set(["product-family","brand-relationship","commercial-action",
  "cooperation-path","company-size"]);
const EDGE_CODEPOINTS=600;

/** Fold only noncritical, correction-supported raw excerpts; original snapshot remains intact. */
export function foldOversizedQualificationPhase<T extends StructuredAiRequest<unknown>>(
  request:T,requestBytes:(value:StructuredAiRequest<unknown>)=>number):T{
  if(request.task!=="lead-qualification"||request.promptVersion!=="qualification-fact-phase-v1")return request;
  const limit=Math.min(leadRequestByteLimit(request)??Number.POSITIVE_INFINITY,57_344);
  if(requestBytes(request)<=limit)return request;
  const input=request.input as PhaseInput|null;
  if(!input||input.evidenceExcerptEncoding||!Array.isArray(input.instructions)
    ||!Array.isArray(input.candidate?.findings)||!Array.isArray(input.candidate.evidence))return request;
  const safeIds=new Set<string>();
  for(const source of input.candidate.evidence){
    const related=input.candidate.findings.filter(finding=>finding.evidenceIds.includes(source.evidenceId));
    if(related.length&&related.every(finding=>finding.status==="supported"
      &&FOLDABLE_KINDS.has(finding.kind)))safeIds.add(source.evidenceId);
  }
  const candidates=input.candidate.evidence.map((source,index)=>({source,index,
    bytes:typeof source.excerpt==="string"?Buffer.byteLength(source.excerpt,"utf8"):0}))
    .filter(item=>safeIds.has(item.source.evidenceId)&&item.bytes>4_096)
    .sort((left,right)=>right.bytes-left.bytes||left.index-right.index);
  if(!candidates.length)return request;
  const evidence=input.candidate.evidence.map(item=>({...item}));
  const foldedIds:string[]=[];
  let best=request;
  let bestFoldedIds:string[]=[];
  for(const item of candidates){
    const points=Array.from(item.source.excerpt);
    const omitted=Math.max(0,points.length-EDGE_CODEPOINTS*2);
    if(!omitted)continue;
    evidence[item.index]={...evidence[item.index],
      excerpt:`${points.slice(0,EDGE_CODEPOINTS).join("")} [${omitted} code points omitted; source sha256 ${createHash("sha256").update(item.source.excerpt).digest("hex")}] ${points.slice(-EDGE_CODEPOINTS).join("")}`,
      excerptFolded:true};
    foldedIds.push(item.source.evidenceId);
    const prepared={...request,input:{...input,
      candidate:{...input.candidate,evidence},
      evidenceExcerptEncoding:"supported-noncritical-head-tail-v1",foldedEvidenceIds:[...foldedIds],
      instructions:[...input.instructions,
        "A listed supported noncritical source excerpt retains exact beginning/end and a SHA-256 marker; its omitted middle is unavailable in this phase. The original corrected fact, source ID, URL, type and original snapshot remain outside this request. Do not treat omitted words as corroboration, negative evidence or a resolved conflict. If missing raw wording could change materiality, mark uncertain; do not upgrade an eligibility gate from folded text."]}} as T;
    if(requestBytes(prepared)<requestBytes(best)){
      best=prepared;
      bestFoldedIds=[...foldedIds];
    }
    if(requestBytes(best)<=limit)break;
  }
  if(best===request)return request;
  return {...best,preparation:{encoding:"supported-noncritical-head-tail-v1",
    originalMaximumWireBytes:requestBytes(request),preparedMaximumWireBytes:requestBytes(best),
    evidenceItems:input.candidate.evidence.length,findingItems:input.candidate.findings.length,
    omittedEvidenceExcerpts:bestFoldedIds.length}};
}
