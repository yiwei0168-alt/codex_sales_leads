import { tenantQuery } from "@/lib/rag/db";

export interface MailboxKnowledgeItem {
  id:string; message_id:string; kind:string; title:string; content:string;
  confidence:number|null; rationale:string|null; model:string|null; reviewed_at:string;
}

export async function listApprovedMailboxKnowledge(userId:string,offset=0,limit=200){
  return tenantQuery<MailboxKnowledgeItem>(userId,
    `select id,message_id,kind,title,content,confidence,rationale,model,reviewed_at::text
     from mailbox_artifact_candidate where user_id=$1 and review_status='approved'
     order by reviewed_at desc nulls last,created_at desc limit $3 offset $2`,[userId,offset,limit]);
}
