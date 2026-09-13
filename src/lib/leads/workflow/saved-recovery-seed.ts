import type {prepareProcessingRecoveryExecution} from "@/lib/assistant/processing-recovery";
import type {CorrectedLeadWorkflowCandidate,LeadWorkflowState} from "./types";

/** Keep evidence dates and source IDs. Completed model outputs re-enter exact cache validation. */
export function savedRecoverySeed(prepared:NonNullable<Awaited<ReturnType<typeof prepareProcessingRecoveryExecution>>>){
  const refreshCandidateIds:string[]=[];
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
    return candidate;
  });
  return {candidates,runId:prepared.runId,discoveredUniqueCount:prepared.scope.companies.length,terminalRecoveryOnly:true,
    savedProcessingRecovery:{sourceActionId:prepared.proof.sourceActionId,sourceRunId:prepared.proof.sourceRunId,
      sourceFingerprint:prepared.proof.checkpointFingerprint,refreshCandidateIds}} satisfies Partial<LeadWorkflowState>;
}
