import {createHash} from "node:crypto";

import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";
import type {StructuredAiRequest} from "@/providers/contracts";
import {LeadRequestTooLargeError,leadRequestByteLimit} from "@/providers/lead-request-bounds";

import type {CorrectedLeadWorkflowCandidate,LeadMarketPlaybook} from "./types";
import {qualificationPhaseOutputJsonSchema} from "./qualification-phase-output";
import {foldOversizedQualificationPhase} from "./qualification-phase-excerpt-fold";

export const QUALIFICATION_FACT_PHASE_VERSION="qualification-fact-phase-v1";

export function qualificationPhaseSourceFingerprint(options:{candidate:CorrectedLeadWorkflowCandidate;
  playbook:LeadMarketPlaybook;countryCode:string;countryName:string;objective:string;modelVersion:string}):string{
  const {candidate,playbook,countryCode,countryName,objective,modelVersion}=options;
  const evidence=candidate.evidence.filter(item=>isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId));
  return createHash("sha256").update(JSON.stringify({version:QUALIFICATION_FACT_PHASE_VERSION,
    candidateId:candidate.candidateId,countryCode,countryName,objective,modelVersion,playbook,
    candidate:{companyName:candidate.companyName,domain:candidate.domain,
      correction:candidate.correction,evidence}})).digest("hex");
}

/** Plans bounded fact-screening inputs; callers must persist and validate outputs before final scoring. */
export function planQualificationFactPhases(options:{candidate:CorrectedLeadWorkflowCandidate;
  playbook:LeadMarketPlaybook;countryCode:string;countryName:string;objective:string;modelVersion:string;
  requestBytes:(request:StructuredAiRequest<unknown>)=>number}){
  const {candidate,playbook,countryCode,countryName,objective,modelVersion,requestBytes}=options;
  const evidence=candidate.evidence.filter(item=>isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId));
  const byId=new Map(evidence.map(item=>[item.id,item]));
  const findings=candidate.correction.findings.map(item=>({...item,
    evidenceIds:item.evidenceIds.filter(id=>byId.has(id))}));
  const linked=new Set(findings.flatMap(item=>item.evidenceIds));
  const units=[...findings.map((item,index)=>({kind:"finding" as const,index,evidenceIds:item.evidenceIds})),
    ...evidence.filter(item=>!linked.has(item.id)).map((item,index)=>({kind:"source" as const,index,
      evidenceIds:[item.id]}))];
  const sourceOnly=evidence.filter(item=>!linked.has(item.id));
  const sourceFingerprint=qualificationPhaseSourceFingerprint(options);
  const build=(chosen:typeof units,index:number):StructuredAiRequest<unknown>=>{
    const factIndexes=new Set(chosen.filter(item=>item.kind==="finding").map(item=>item.index));
    const sourceIndexes=new Set(chosen.filter(item=>item.kind==="source").map(item=>item.index));
    const selectedFindings=findings.filter((_,position)=>factIndexes.has(position));
    const selectedSources=sourceOnly.filter((_,position)=>sourceIndexes.has(position));
    const ids=new Set([...selectedFindings.flatMap(item=>item.evidenceIds),...selectedSources.map(item=>item.id)]);
    const selectedEvidence=evidence.filter(item=>ids.has(item.id));
    const request={task:"lead-qualification",modelVersion,promptVersion:QUALIFICATION_FACT_PHASE_VERSION,
      input:{phaseIndex:index,sourceFingerprint,unlinkedEvidenceIds:selectedSources.map(item=>item.id),
        market:{countryCode,countryName,objective},
        candidate:{candidateId:candidate.candidateId,companyName:candidate.companyName,domain:candidate.domain,
          primaryRole:candidate.correction.primaryRole,resolvedRoles:candidate.correction.resolvedRoles,
          findings:selectedFindings,evidence:selectedEvidence.map(item=>({evidenceId:item.id,
            sourceType:item.sourceType,url:item.url,title:item.title,excerpt:item.excerpt}))},
        playbook:{marketHypothesis:playbook.marketHypothesis,productAngles:playbook.productAngles,
          preferredCompanyTraits:playbook.preferredCompanyTraits},
        instructions:["This is a bounded evidence-screening phase, not a final eligibility or score decision.",
          "Return exactly one fact record for each supplied findingId and one source record for each supplied unlinked evidenceId. Preserve uncertainty, disagreement and negative evidence; never turn missing information into rejection.",
          "Use only supplied source text. Keep a concise, evidence-linked summary of every supplied finding and unlinked source. Do not infer omitted facts or create new evidence IDs. Final scoring will consider all validated phases together."]},
      evidenceIds:selectedEvidence.map(item=>item.id),outputSchema:qualificationPhaseOutputJsonSchema,
      dataClassification:playbook.cooperationPathMemory?.length?"private-workspace":"public"} as StructuredAiRequest<unknown>;
    return foldOversizedQualificationPhase(request,requestBytes);
  };
  const phases:StructuredAiRequest<unknown>[]=[];
  let pending:typeof units=[];
  for(const unit of units){
    const trial=build([...pending,unit],phases.length);
    // Use the tighter approved score-only ceiling even when this phase has no final score output.
    const limit=Math.min(leadRequestByteLimit(trial)!,57_344);
    const bytes=requestBytes(trial);
    if(bytes<=limit){pending.push(unit);continue;}
    if(!pending.length)throw new LeadRequestTooLargeError(bytes,limit);
    phases.push(build(pending,phases.length));
    pending=[unit];
    const single=build(pending,phases.length);
    const singleBytes=requestBytes(single);
    if(singleBytes>limit)throw new LeadRequestTooLargeError(singleBytes,limit);
  }
  if(pending.length)phases.push(build(pending,phases.length));
  return {sourceFingerprint,phases};
}
