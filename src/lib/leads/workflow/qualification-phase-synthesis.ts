import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";

import type {CorrectedLeadWorkflowCandidate,LeadMarketPlaybook} from "./types";
import {qualificationPhaseSourceFingerprint,QUALIFICATION_FACT_PHASE_VERSION,
  type planQualificationFactPhases} from "./qualification-phase-plan";
import {validateQualificationPhaseOutput,type QualificationPhaseOutput} from "./qualification-phase-output";
import {qualificationSingletonPresentations,
  type QualificationSingletonScreening} from "./qualification-singleton-presentation";

type PhasePlan=ReturnType<typeof planQualificationFactPhases>;
export const QUALIFICATION_PHASE_SYNTHESIS_VERSION="qualification-phase-synthesis-v1";

/** Keeps original corrected facts and citation identities beside bounded phase interpretations. */
export function assembleQualificationPhaseSynthesis(options:{candidate:CorrectedLeadWorkflowCandidate;
  playbook:LeadMarketPlaybook;countryCode:string;countryName:string;objective:string;modelVersion:string;
  plan:PhasePlan;outputs:QualificationPhaseOutput[];
  singletonScreenings?:readonly QualificationSingletonScreening[]}){
  const {candidate,playbook,countryCode,countryName,objective,modelVersion,plan,outputs,
    singletonScreenings=[]}=options;
  const originalSourceFingerprint=qualificationPhaseSourceFingerprint({candidate,playbook,countryCode,
    countryName,objective,modelVersion});
  const presentations=qualificationSingletonPresentations(candidate,singletonScreenings,
    originalSourceFingerprint);
  const expectedFingerprint=qualificationPhaseSourceFingerprint({candidate,playbook,countryCode,countryName,
    objective,modelVersion,singletonScreenings});
  if(plan.sourceFingerprint!==expectedFingerprint||plan.phases.length===0||outputs.length!==plan.phases.length)
    throw new Error("Qualification phase synthesis source or output count differs");
  const currentEvidence=candidate.evidence.filter(item=>isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId));
  const evidenceById=new Map(currentEvidence.map(item=>[item.id,item]));
  if(evidenceById.size!==currentEvidence.length)throw new Error("Qualification phase source IDs are duplicated");
  const findingsById=new Map(candidate.correction.findings.map(item=>[item.findingId,item]));
  if(findingsById.size!==candidate.correction.findings.length)
    throw new Error("Qualification phase finding IDs are duplicated");
  const seenFacts=new Map<string,QualificationPhaseOutput["facts"][number]>();
  const seenSources=new Map<string,QualificationPhaseOutput["sources"][number]>();
  const seenEvidence=new Set<string>();
  const foldedEvidenceIds=new Set<string>();
  for(const [index,request] of plan.phases.entries()){
    const input=request.input as {phaseIndex?:unknown;sourceFingerprint?:unknown;foldedEvidenceIds?:unknown;
      market?:{countryCode?:unknown};candidate?:{candidateId?:unknown}}|null;
    if(request.task!=="lead-qualification"||request.promptVersion!==QUALIFICATION_FACT_PHASE_VERSION
      ||request.modelVersion!==modelVersion||input?.sourceFingerprint!==expectedFingerprint
      ||input?.phaseIndex!==index||input?.market?.countryCode!==countryCode
      ||input?.candidate?.candidateId!==candidate.candidateId)
      throw new Error("Qualification phase synthesis request identity differs");
    const output=validateQualificationPhaseOutput(request,outputs[index]);
    const folded=input?.foldedEvidenceIds;
    if(folded!==undefined){
      if(!Array.isArray(folded)||folded.some(id=>typeof id!=="string"||!request.evidenceIds.includes(id)))
        throw new Error("Qualification phase folded source identities differ");
      for(const id of folded)foldedEvidenceIds.add(id);
    }
    for(const id of request.evidenceIds){
      if(!evidenceById.has(id))throw new Error("Qualification phase synthesis includes an unknown source");
      seenEvidence.add(id);
    }
    for(const fact of output.facts){
      if(!findingsById.has(fact.findingId)||seenFacts.has(fact.findingId))
        throw new Error("Qualification phase synthesis has duplicate or unknown facts");
      seenFacts.set(fact.findingId,fact);
    }
    for(const source of output.sources){
      if(!evidenceById.has(source.evidenceId)||seenSources.has(source.evidenceId))
        throw new Error("Qualification phase synthesis has duplicate or unknown unlinked sources");
      seenSources.set(source.evidenceId,source);
    }
  }
  if(seenFacts.size!==findingsById.size||seenEvidence.size!==evidenceById.size)
    throw new Error("Qualification phase synthesis is incomplete");
  const linked=new Set(candidate.correction.findings.flatMap(item=>item.evidenceIds)
    .filter(id=>evidenceById.has(id)));
  if(currentEvidence.some(item=>!linked.has(item.id)&&!seenSources.has(item.id))
    ||[...seenSources.keys()].some(id=>linked.has(id)))
    throw new Error("Qualification phase unlinked source coverage differs");
  return {version:QUALIFICATION_PHASE_SYNTHESIS_VERSION,sourceFingerprint:expectedFingerprint,
    candidateId:candidate.candidateId,foldedEvidenceIds:[...foldedEvidenceIds],
    chunkedFindingIds:candidate.correction.findings.filter(item=>presentations.has(`finding:${item.findingId}`))
      .map(item=>item.findingId),
    chunkedEvidenceIds:currentEvidence.filter(item=>presentations.has(`evidence:${item.id}`))
      .map(item=>item.id),
    chunkedUnitHashes:Object.fromEntries(singletonScreenings.map(item=>[
      `${item.unitKind}:${item.unitId}`,item.contentSha256])),
    facts:candidate.correction.findings.map(item=>{
      const screening=seenFacts.get(item.findingId)!;
      return {findingId:item.findingId,kind:item.kind,
        statement:presentations.get(`finding:${item.findingId}`)??item.statement,status:item.status,
        roles:item.roles,evidenceIds:item.evidenceIds.filter(id=>evidenceById.has(id)),
        sourceTypes:item.sourceTypes,confidence:item.confidence,notes:item.notes,
        screeningMateriality:screening.materiality,screeningSummary:screening.summary,
        screeningCitedEvidenceIds:screening.evidenceIds};
    }),
    sources:currentEvidence.map(item=>({evidenceId:item.id,sourceType:item.sourceType,
      url:item.url,title:item.title,
      linkedFindingIds:candidate.correction.findings.filter(finding=>finding.evidenceIds.includes(item.id))
        .map(finding=>finding.findingId),
      ...(seenSources.has(item.id)?{screeningMateriality:seenSources.get(item.id)!.materiality,
        screeningSummary:seenSources.get(item.id)!.summary}:{})})),
  } as const;
}
