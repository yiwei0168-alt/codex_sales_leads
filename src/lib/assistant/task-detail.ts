import { tenantQuery } from "@/lib/rag/db";
import { getAssistantAction } from "./repository";
import { decryptMailboxContent } from "@/lib/mailbox/crypto";
export async function readTaskDetail(userId:string,id:string,kind:string,offset=0){
  if(kind==="generation"){
    const rows=await tenantQuery(userId,"select id,stage,status,metrics,created_at,updated_at from product_operation_metric where user_id=$1 and id=$2 and stage in ('development-generation','development-revision')",[userId,id]);return rows[0]?{kind,details:rows[0]}:null;
  }
  if(kind==="relationship"){
    const rows=await tenantQuery(userId,`select id,country_code,status,result,metrics,created_at,updated_at from user_relationship_analysis where user_id=$1 and id=$2`,[userId,id]);return rows[0]?{kind,details:rows[0]}:null;
  }
  if(kind==="search"){
    const action=await getAssistantAction(userId,id);if(!action)return null;
    const candidates=await tenantQuery(userId,`select a.company_name as "company",a.domain,a.primary_role as "role",a.eligible,a.total_score as "score",a.selected,a.reasons,a.risks,a.unknowns
      from lead_workflow_job j join lead_search_run r on r.graph_thread_id=j.graph_thread_id
      join lead_candidate_assessment a on a.run_id=r.id and a.user_id=$1 where j.user_id=$1 and j.action_id=$2
      order by a.selected desc,a.total_score desc,a.id limit 51 offset $3`,[userId,id,offset]);
    return {kind,action,details:{candidates:candidates.slice(0,50),hasMore:candidates.length>50,offset}};
  }
  if(kind==="contacts"){
    const rows=await tenantQuery(userId,`select r.id,r.status,r.provider_mix,r.target_count,r.processed_count,r.search_credits_used,r.extract_credits_used,r.started_at,r.finished_at,r.metadata
      from company_enrichment_run r join market_workspace w on w.id=r.workspace_id where r.id=$2 and w.owner_id=$1`,[userId,id]);if(!rows[0])return null;
    const items=await tenantQuery(userId,`select c.canonical_name as company,i.status,i.phase,i.attempts,i.named_contact_count,i.email_count,i.search_credits_used,i.extract_credits_used,i.error_message
      from company_enrichment_run_item i join company_enrichment_run r on r.id=i.run_id join market_workspace w on w.id=r.workspace_id
      join sales_company c on c.id=i.company_id where i.run_id=$2 and w.owner_id=$1 order by c.canonical_name,i.id limit 51 offset $3`,[userId,id,offset]);
    return {kind,details:{...rows[0],items:items.slice(0,50),hasMore:items.length>50,offset}};
  }
  if(kind==="draft"){
    const rows=await tenantQuery(userId,`select d.id,c.canonical_name as company,d.status,d.revision,d.model,d.prompt_version,d.generation_metrics,d.strategy,
      coalesce(d.manual_body,d.body) as body,d.subject_options,d.created_at,d.updated_at from outreach_draft d
      join sales_company c on c.id=d.company_id where d.user_id=$1 and d.id=$2`,[userId,id]);return rows[0]?{kind,details:rows[0]}:null;
  }
  if(kind==="send"){
    const rows=await tenantQuery<{content_ciphertext:string;[key:string]:unknown}>(userId,`select m.id,c.canonical_name as company,m.status,m.error_code,m.created_at,m.sent_at,m.parent_id,m.content_ciphertext
      from outbound_mail m join sales_company c on c.id=m.company_id where m.user_id=$1 and m.id=$2`,[userId,id]);
    if(!rows[0])return null;const {content_ciphertext,...metadata}=rows[0];return {kind,details:{...metadata,...decryptMailboxContent(userId,content_ciphertext)}};
  }
  return null;
}
