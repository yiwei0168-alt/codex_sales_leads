import {z} from "zod";

import type {StructuredAiRequest} from "@/providers/contracts";

export const qualificationPhaseOutputSchema=z.strictObject({
  facts:z.array(z.strictObject({
    findingId:z.string().min(1),materiality:z.enum(["material","context","uncertain"]),
    summary:z.string().trim().min(1).max(240),evidenceIds:z.array(z.string().min(1)),
  })),
  sources:z.array(z.strictObject({
    evidenceId:z.string().min(1),materiality:z.enum(["material","context","uncertain"]),
    summary:z.string().trim().min(1).max(240),
  })),
});
export type QualificationPhaseOutput=z.infer<typeof qualificationPhaseOutputSchema>;
export const qualificationPhaseOutputJsonSchema=z.toJSONSchema(qualificationPhaseOutputSchema) as Record<string,unknown>;

/** Exact coverage and citation closure are mandatory before a phase can be checkpointed. */
export function validateQualificationPhaseOutput(request:StructuredAiRequest<unknown>,output:unknown):QualificationPhaseOutput{
  const parsed=qualificationPhaseOutputSchema.parse(output);
  const input=request.input as {candidate?:{findings?:Array<{findingId:string;evidenceIds:string[]}>;
    evidence?:Array<{evidenceId:string}>};unlinkedEvidenceIds?:string[]}|null;
  const findings=input?.candidate?.findings;
  const evidence=input?.candidate?.evidence;
  const sourceIds=input?.unlinkedEvidenceIds;
  if(!Array.isArray(findings)||!Array.isArray(evidence)||!Array.isArray(sourceIds))
    throw new Error("Qualification phase request is incomplete");
  const expectedFacts=new Map(findings.map(item=>[item.findingId,item]));
  const allowedEvidence=new Set(evidence.map(item=>item.evidenceId));
  const expectedSources=new Set(sourceIds);
  if(expectedFacts.size!==findings.length||allowedEvidence.size!==evidence.length
    ||expectedSources.size!==sourceIds.length||request.evidenceIds.length!==evidence.length
    ||request.evidenceIds.some((id,index)=>id!==evidence[index].evidenceId)
    ||sourceIds.some(id=>!allowedEvidence.has(id))
    ||findings.some(item=>item.evidenceIds.some(id=>!allowedEvidence.has(id))))
    throw new Error("Qualification phase request has inconsistent identities or citations");
  if(parsed.facts.length!==findings.length||parsed.sources.length!==sourceIds.length)
    throw new Error("Qualification phase output has missing or extra items");
  const facts=new Map<string,QualificationPhaseOutput["facts"][number]>();
  for(const item of parsed.facts){
    const finding=expectedFacts.get(item.findingId);
    if(!finding||facts.has(item.findingId))throw new Error("Qualification phase output has unknown or duplicate finding ID");
    const cited=new Set(item.evidenceIds);
    if(cited.size!==item.evidenceIds.length||item.evidenceIds.some(id=>!allowedEvidence.has(id)
      ||!finding.evidenceIds.includes(id)))throw new Error("Qualification phase fact citation is outside its source closure");
    facts.set(item.findingId,item);
  }
  const sources=new Map<string,QualificationPhaseOutput["sources"][number]>();
  for(const item of parsed.sources){
    if(!expectedSources.has(item.evidenceId)||sources.has(item.evidenceId))
      throw new Error("Qualification phase output has unknown or duplicate unlinked source ID");
    sources.set(item.evidenceId,item);
  }
  return {facts:findings.map(item=>facts.get(item.findingId)!),
    sources:sourceIds.map(id=>sources.get(id)!)};
}
