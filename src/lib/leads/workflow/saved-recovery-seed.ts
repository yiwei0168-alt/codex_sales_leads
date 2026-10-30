import type {prepareProcessingRecoveryExecution} from "@/lib/assistant/processing-recovery";
import type {CorrectedLeadWorkflowCandidate,LeadWorkflowState} from "./types";

/** Keep evidence dates and source IDs. Completed model outputs re-enter exact cache validation. */
export function savedRecoverySeed(prepared:NonNullable<Awaited<ReturnType<typeof prepareProcessingRecoveryExecution>>>){
  const refreshCandidateIds:string[]=[];
  const correctedCandidates:CorrectedLeadWorkflowCandidate[]=[];
  const savedPathRepairs:NonNullable<LeadWorkflowState["savedPathRepairs"]>=[];
  const candidates=prepared.scope.companies.flatMap(company=>company.candidates).map(source=>{
    const candidate=structuredClone(source);
    delete (candidate as Partial<CorrectedLeadWorkflowCandidate>).correction;
    const readiness=prepared.evidenceReadiness.find(item=>item.candidateId===candidate.candidateId);
    const refresh=!readiness||readiness.needsEvidenceRefresh;
    if(refresh)refreshCandidateIds.push(candidate.candidateId);
    candidate.evidenceSnapshotRunId=prepared.runId;
    candidate.evidence=candidate.evidence.map(item=>({...item,priorRunId:item.evidenceRunId??prepared.proof.sourceRunId,
      evidenceRunId:prepared.runId,freshnessStatus:item.sourceType==="discovery"?item.freshnessStatus:
        refresh?"stale" as const:"revalidated" as const}));
    const company=prepared.scope.companies.find(company=>company.sourceCandidateIds?.includes(candidate.candidateId));
    if(!refresh&&company?.stage==="path-repair"&&company.pathAssessment&&"correction" in source){
      correctedCandidates.push({...candidate,correction:structuredClone((source as CorrectedLeadWorkflowCandidate).correction)});
      savedPathRepairs.push({candidateId:candidate.candidateId,assessment:structuredClone(company.pathAssessment)});
    }
    return candidate;
  });
  return {candidates,correctedCandidates,savedPathRepairs,
    playbook:prepared.state?.playbook?structuredClone(prepared.state.playbook):undefined,
    runId:prepared.runId,discoveredUniqueCount:prepared.scope.companies.length,terminalRecoveryOnly:true,
    savedProcessingRecovery:{sourceActionId:prepared.proof.sourceActionId,sourceRunId:prepared.proof.sourceRunId,
      sourceFingerprint:prepared.proof.checkpointFingerprint,refreshCandidateIds}} satisfies Partial<LeadWorkflowState>;
}
