import {tenantTransaction} from "@/lib/rag/db";
import {tenantQuery} from "@/lib/rag/db";
import {createHash} from "node:crypto";
import {upsertKnowledgeDocument} from "@/lib/rag/repository";
import {trackedOperation} from "@/lib/tracked-operation";

export type ReviewStatus = "approved" | "rejected";
type CandidateContent={kind:string;title:string;content:string;structured_data:Record<string,unknown>};
function candidateHash(candidate:CandidateContent){
  return createHash("sha256").update(JSON.stringify({kind:candidate.kind,title:candidate.title,content:candidate.content,structuredData:candidate.structured_data})).digest("hex");
}
export async function listPendingMailboxCandidates(userId:string,offset=0,limit=50){
  const rows=await tenantQuery<{
    id:string;message_id:string;kind:string;title:string;content:string;structured_data:Record<string,unknown>;
    review_status:string;created_at:string;confidence:number|null;rationale:string|null;model:string|null;
  }>(userId,`select id,message_id,kind,title,content,structured_data,review_status,confidence,rationale,model,created_at::text
      from mailbox_artifact_candidate where user_id=$1 and review_status='pending' order by created_at desc limit $2 offset $3`,[userId,Math.min(Math.max(limit,1),50),Math.max(offset,0)]);
  return rows.map(row=>({...row,excerpt:row.content.slice(0,1200),contentHash:candidateHash(row)}));
}

export async function reviewMailboxCandidate(userId:string,id:string,status:ReviewStatus,expectedHash?:string){
  return trackedOperation(userId,"mailbox-candidate-review",1,0,()=>reviewLocked(userId,id,status,expectedHash),result=>({
    outputItems:result.kind==="saved"&&!result.reused?1:0,
    validOutputItems:result.kind==="saved"&&!result.reused?1:0,downstreamUsedItems:null,
    costUsd:result.kind==="saved"&&!result.reused&&status==="approved"?null:0,
    inputTokens:result.kind==="saved"&&!result.reused&&status==="approved"?null:0,outputTokens:0,retries:0,
    discardedReasonCounts:result.kind==="saved"?(result.reused?{alreadyReviewed:1}:{}):{[result.kind]:1},
    usageBoundary:"review-decision-saved-not-downstream-retrieval-or-user-adoption",
    optimizationOpportunity:"Reuse completed review decisions and unchanged knowledge; never replay unknown paid embedding requests",
  }));
}

async function reviewLocked(userId:string,id:string,status:ReviewStatus,expectedHash?:string){
  return tenantTransaction(userId,async client=>{
    // Do not queue concurrent clicks while holding all available pool connections.
    const lock=await client.query<{locked:boolean}>(
      "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",[`mailbox-review:${userId}:${id}`]);
    if(!lock.rows[0]?.locked)return {kind:"busy"} as const;
    const result=await client.query<{id:string;kind:string;title:string;content:string;structured_data:Record<string,unknown>;review_status:string}>(
      "select id,kind,title,content,structured_data,review_status from mailbox_artifact_candidate where id=$1 and user_id=$2 for update",[id,userId]);
    const candidate=result.rows[0];
    if(!candidate)return {kind:"missing"} as const;
    if(expectedHash&&candidateHash(candidate)!==expectedHash)return {kind:"conflict"} as const;
    if(candidate.review_status===status)return {kind:"saved",status,reused:true} as const;
    if(candidate.review_status!=="pending")return {kind:"conflict"} as const;
    const externalId=`mailbox-artifact:${id}`;
    if(status==="rejected"){
      // A prior approval may have saved knowledge before its review transaction failed.
      // Preserve that recoverable approval rather than mislabelling its knowledge rejected.
      const saved=await client.query("select id from knowledge_document where owner_id=$1 and external_id=$2 limit 1",[userId,externalId]);
      if(saved.rowCount)return {kind:"approval-incomplete"} as const;
    }else{
      await upsertKnowledgeDocument(userId,{
        collection:"company",externalId,title:candidate.title,content:candidate.content,
        sourceType:"private-mailbox-approved",authorityLevel:4,language:"auto",companyId:"cudy-technology",
        capturedAt:new Date().toISOString(),metadata:{mailboxArtifactKind:candidate.kind,privateToUser:true},visibility:"private",
      });
    }
    await client.query("update mailbox_artifact_candidate set review_status=$3,reviewed_at=now() where id=$1 and user_id=$2 and review_status='pending'",[id,userId,status]);
    return {kind:"saved",status,reused:false} as const;
  });
}
