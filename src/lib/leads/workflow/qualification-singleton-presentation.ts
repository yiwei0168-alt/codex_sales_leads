import {createHash} from "node:crypto";

import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";

import type {CorrectedLeadWorkflowCandidate} from "./types";
import {QUALIFICATION_SINGLETON_CHUNK_VERSION,
  type assembleQualificationSingletonChunks} from "./qualification-singleton-chunks";

export type QualificationSingletonScreening=ReturnType<typeof assembleQualificationSingletonChunks>;

/** Validates a complete chunk screening against the immutable original candidate snapshot. */
export function qualificationSingletonPresentations(candidate:CorrectedLeadWorkflowCandidate,
  screenings:readonly QualificationSingletonScreening[],originalSourceFingerprint:string){
  if(!/^[a-f0-9]{64}$/.test(originalSourceFingerprint))
    throw new Error("Qualification singleton original source fingerprint is invalid");
  const evidence=candidate.evidence.filter(item=>isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId));
  const byEvidence=new Map(evidence.map(item=>[item.id,item]));
  const byFinding=new Map(candidate.correction.findings.map(item=>[item.findingId,item]));
  if(byEvidence.size!==evidence.length||byFinding.size!==candidate.correction.findings.length)
    throw new Error("Qualification singleton original IDs are duplicated");
  const presentations=new Map<string,string>();
  for(const item of screenings){
    const key=`${item.unitKind}:${item.unitId}`;
    if(presentations.has(key)||item.candidateSourceFingerprint!==originalSourceFingerprint
      ||!Number.isSafeInteger(item.partCount)||item.partCount<1
      ||item.partSummaries.length!==item.partCount
      ||item.partSummaries.some(summary=>!summary.trim()||summary.length>270)
      ||new Set(item.citedEvidenceIds).size!==item.citedEvidenceIds.length
      ||!(["material","context","uncertain"] as unknown[]).includes(item.materiality))
      throw new Error("Qualification singleton screening identity or coverage differs");
    const finding=item.unitKind==="finding"?byFinding.get(item.unitId):undefined;
    const source=item.unitKind==="evidence"?byEvidence.get(item.unitId):undefined;
    const original=finding?.statement??source?.excerpt;
    const allowed=finding?finding.evidenceIds.filter(id=>byEvidence.has(id)):source?[source.id]:[];
    if(!original||createHash("sha256").update(original).digest("hex")!==item.contentSha256
      ||item.citedEvidenceIds.some(id=>!allowed.includes(id)))
      throw new Error("Qualification singleton screening original text or citations differ");
    const expectedCheckpoint=createHash("sha256").update(JSON.stringify({
      version:QUALIFICATION_SINGLETON_CHUNK_VERSION,candidateSourceFingerprint:originalSourceFingerprint,
      unitKind:item.unitKind,unitId:item.unitId,contentSha256:item.contentSha256,
    })).digest("hex");
    if(item.checkpointFingerprint!==expectedCheckpoint)
      throw new Error("Qualification singleton screening checkpoint differs");
    presentations.set(key,`Complete ${item.partCount}-part model screening of original ${item.unitKind} `
      +`${item.unitId}; original sha256 ${item.contentSha256}; aggregate materiality ${item.materiality}; `
      +`cited original evidence IDs ${JSON.stringify(item.citedEvidenceIds)}. `
      +`These are interpretations, not new source facts or independent corroboration: `
      +item.partSummaries.join(" "));
  }
  return presentations;
}
