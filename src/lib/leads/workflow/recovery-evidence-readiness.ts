import type {PoolClient} from "pg";
import {ACTIVE_LEAD_SCORING_POLICY} from "@/lib/leads/scoring-policy";
import {isCurrentLeadScoringEvidence} from "@/lib/leads/evidence-snapshot";
import type {LeadWorkflowCandidate} from "./types";

export interface RecoveryEvidenceSnapshot {
  candidate_id:string;source_url:string;content_hash:string;content:string;source_type:string;
  retrieved_at:Date|string;expires_at:Date|string;evidence_kinds:string[];public_valid:boolean;
}

/** Expiry is checked at recovery time, never extended by copying into a new task. */
export function recoveryEvidenceReadiness(candidate:LeadWorkflowCandidate,snapshots:RecoveryEvidenceSnapshot[],now:Date){
  const reasons:Record<string,number>={};
  let reusableEvidence=0;
  const clock=now.getTime();
  for(const item of candidate.evidence){
    if(item.sourceType==="discovery")continue;
    let reason:string|null=null;
    const saved=snapshots.find(row=>row.candidate_id===candidate.candidateId&&row.source_url===item.url
      &&row.content_hash===item.contentHash&&row.content===item.excerpt&&row.source_type===item.sourceType);
    if(!isCurrentLeadScoringEvidence(item,candidate.evidenceSnapshotRunId))reason="invalid-evidence-binding";
    else if(!saved)reason="missing-saved-evidence";
    else{
      const captured=Date.parse(item.capturedAt),retrieved=new Date(saved.retrieved_at).getTime(),expires=new Date(saved.expires_at).getTime();
      const configured=ACTIVE_LEAD_SCORING_POLICY.evidenceFreshnessDays as Record<string,number>;
      const days=saved.evidence_kinds.map(kind=>configured[kind]).filter(value=>Number.isFinite(value)&&value>0);
      const currentExpiry=retrieved+(days.length?Math.min(...days):90)*86400000;
      if(!Number.isFinite(clock)||!Number.isFinite(captured)||!Number.isFinite(retrieved)||!Number.isFinite(expires)
        ||captured!==retrieved||retrieved>clock||expires<=retrieved)reason="invalid-evidence-date";
      else if(clock>=Math.min(expires,currentExpiry))reason="expired-evidence";
      else if(!saved.public_valid)reason="superseded-or-invalid-public-evidence";
    }
    if(reason)reasons[reason]=(reasons[reason]??0)+1;else reusableEvidence++;
  }
  if(!reusableEvidence&&!Object.keys(reasons).length)reasons["missing-scoring-evidence"]=1;
  return {candidateId:candidate.candidateId,reusableEvidence,needsEvidenceRefresh:Object.keys(reasons).length>0,reasons};
}

export async function readRecoveryEvidenceReadiness(client:PoolClient,userId:string,runId:string,candidates:LeadWorkflowCandidate[],now=new Date()){
  const rows=await client.query<RecoveryEvidenceSnapshot>(`select e.candidate_id,e.source_url,e.content_hash,e.content,e.source_type,
    e.retrieved_at,e.expires_at,e.evidence_kinds,
    (e.public_document_version_id is null or exists(select 1 from public_evidence.document_version d
      where d.id=e.public_document_version_id and d.freshness_status in ('current','revalidated')
      and not exists(select 1 from public_evidence.document_version n where n.previous_version_id=d.id and n.freshness_status<>'invalid'))) as public_valid
    from lead_evidence_snapshot e where e.user_id=$1 and e.run_id=$2`,[userId,runId]);
  return candidates.map(candidate=>recoveryEvidenceReadiness(candidate,rows.rows,now));
}
