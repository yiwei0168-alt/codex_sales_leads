import {ACTIVE_LEAD_SCORING_POLICY} from "@/lib/leads/scoring-policy";
import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";
import {tenantQuery} from "@/lib/rag/db";
import type {LeadWorkflowState} from "./types";
import type {recoveryEvidenceReadiness} from "./recovery-evidence-readiness";
import {completedStageMetric} from "./workflow-telemetry";

type Readiness=ReturnType<typeof recoveryEvidenceReadiness>;

export async function readCurrentRecoveryPublicVersions(userId:string,state:LeadWorkflowState):Promise<ReadonlySet<string>>{
  const ids=[...new Set(state.candidates.flatMap(candidate=>candidate.evidence.flatMap(item=>
    item.publicDocumentVersionId?[item.publicDocumentVersionId]:[])))];
  if(!ids.length)return new Set();
  const validIds=ids.filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if(!validIds.length)return new Set();
  const rows=await tenantQuery<{id:string}>(userId,`select d.id::text as id from public_evidence.document_version d
    where d.id=any($1::uuid[]) and d.freshness_status in ('current','revalidated')
      and not exists(select 1 from public_evidence.document_version n where n.previous_version_id=d.id
        and n.freshness_status<>'invalid')`,[validIds]);
  return new Set(rows.map(row=>row.id.toLowerCase()));
}

/** Recheck a retained checkpoint before any downstream node can use its evidence. */
export function revalidateSavedRecoveryResume(state:LeadWorkflowState,readiness:Readiness[],now=new Date(),
  validPublicVersionIds:ReadonlySet<string>=new Set()):Partial<LeadWorkflowState>|null{
  const recovery=state.savedProcessingRecovery;
  if(!recovery||!state.runId)return null;
  const startedAt=Date.now();
  const source=new Map(readiness.map(item=>[item.candidateId,item]));
  const expiredIds=new Set<string>();
  const queue=new Set(recovery.refreshCandidateIds);
  const configured=ACTIVE_LEAD_SCORING_POLICY.evidenceFreshnessDays as Record<string,number>;
  const candidates=state.candidates.map(candidate=>{
    const correction=state.correctedCandidates.find(item=>item.candidateId===candidate.candidateId)?.correction;
    let changed=false;
    const evidence=candidate.evidence.map(item=>{
      if(item.sourceType==="discovery"||!(["fresh","revalidated"] as const).includes(item.freshnessStatus as "fresh"|"revalidated"))return item;
      const kinds=correction?.findings.filter(finding=>finding.evidenceIds.includes(item.id)).map(finding=>configured[finding.kind])??[];
      const days=kinds.filter(value=>Number.isFinite(value)&&value>0);
      const freshnessDays=days.length?Math.min(...days):90;
      const captured=Date.parse(item.capturedAt);
      const invalidDate=!Number.isFinite(now.getTime())||!Number.isFinite(captured)||captured>now.getTime()
        ||now.getTime()>=captured+freshnessDays*86400000;
      const stale=(item.freshnessStatus==="revalidated"&&source.get(candidate.candidateId)?.needsEvidenceRefresh!==false)
        ||invalidDate||!isCurrentLeadScoringEvidence(item,state.runId!)
        ||Boolean(item.publicDocumentVersionId&&!validPublicVersionIds.has(item.publicDocumentVersionId.toLowerCase()));
      if(!stale)return item;
      changed=true;
      return {...item,freshnessStatus:"stale" as const};
    });
    if(changed)expiredIds.add(candidate.candidateId);
    if(!evidence.some(item=>isCurrentLeadScoringEvidence(item,state.runId!)))queue.add(candidate.candidateId);
    return changed?{...candidate,evidence}:candidate;
  });
  for(const id of queue)if(!recovery.refreshCandidateIds.includes(id))expiredIds.add(id);
  if(!expiredIds.size)return null;
  const keep=(candidateId:string)=>!expiredIds.has(candidateId);
  const metric=completedStageMetric({stage:"recovery_resume_evidence_revalidation",startedAt,input:state.candidates,
    output:candidates,inputItems:state.candidates.length,outputItems:candidates.length,generatedArtifacts:0,
    validArtifacts:candidates.length-expiredIds.size,downstreamUsedArtifacts:0,
    metadata:{expiredOrUnverifiableCandidates:expiredIds.size,queuedForRefresh:queue.size,
      retries:0,usageBoundary:"checkpoint-revalidation-before-downstream-use"}});
  return {candidates,correctedCandidates:state.correctedCandidates.filter(item=>keep(item.candidateId)),
    assessments:state.assessments.filter(item=>keep(item.candidateId)),
    assessmentReviews:state.assessmentReviews.filter(item=>keep(item.candidateId)),
    handoffs:state.handoffs.filter(item=>keep(item.provenance.candidateId)),
    acceptedCandidateCount:0,targetCompletionReason:"processing-incomplete",targetShouldContinue:false,
    savedProcessingRecovery:{...recovery,refreshCandidateIds:[...queue],evidenceBlocked:false},
    stageMetrics:[...(state.stageMetrics??[]),metric],
    warnings:[...(state.warnings??[]),`恢复检查点重新核验：${expiredIds.size} 家证据已过期或无法确认，保留既有费用并重回必要补证。`]};
}
