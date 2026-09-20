import {tenantQuery} from "@/lib/rag/db";
import {decryptMailboxContent} from "@/lib/mailbox/crypto";

/** Read the most recent saved formal assessment; never calculate or publish a score. */
export async function readSavedCompanyAssessment(userId:string,externalId:string){
  const rows=await tenantQuery(userId,`select a.total_score as "totalScore",a.dimensions,a.reasons,a.risks,a.unknowns,a.evidence,
    a.updated_at::text as "assessedAt",r.scoring_policy_version as "policyVersion",r.scoring_policy_snapshot as "policySnapshot"
    from user_company_market wc join market_workspace w on w.id=wc.workspace_id join sales_company c on c.id=wc.company_id
    join lead_candidate_assessment a on a.run_id=wc.search_run_id and lower(a.domain)=lower(c.domain) and a.user_id=$1
    join lead_search_run r on r.id=a.run_id where w.owner_id=$1 and wc.candidate_id=$2 and r.country_code=wc.market_country_code
    order by a.updated_at desc limit 1`,[userId,externalId]);
  return rows[0]??null;
}

/** Metadata only; read one message with mail_read before using its body. */
export async function listCompanyCorrespondence(userId:string,externalId:string,offset:number){
  const rows=await tenantQuery<{id:string;direction:string;sentAt:string|null;source:string;content_ciphertext:string|null;subject:string}>(userId,
    `select m.id,m.direction,m.sent_at::text as "sentAt",l.source,m.content_ciphertext,m.subject
      from mailbox_message_company l join mailbox_message m on m.id=l.message_id and m.user_id=l.user_id
      join sales_company c on c.id=l.company_id join user_company_market wc on wc.company_id=c.id
      join market_workspace w on w.id=wc.workspace_id
      where l.user_id=$1 and w.owner_id=$1 and w.slug='global-sales' and wc.candidate_id=$2 and l.source in ('domain-match','user-confirmed')
      order by m.sent_at desc nulls last,m.id desc limit 21 offset $3`,[userId,externalId,offset]);
  const companyFound=rows.length>0||Boolean((await tenantQuery(userId,`select 1 from user_company_market wc
    join market_workspace w on w.id=wc.workspace_id where w.owner_id=$1 and w.slug='global-sales' and wc.candidate_id=$2 limit 1`,[userId,externalId])).length);
  return {messages:rows.slice(0,20).map(row=>({id:row.id,direction:row.direction,sentAt:row.sentAt,source:row.source,
    subject:row.content_ciphertext?decryptMailboxContent(userId,row.content_ciphertext).subject:row.subject})),hasMore:rows.length>20,fetched:rows.length,companyFound};
}
