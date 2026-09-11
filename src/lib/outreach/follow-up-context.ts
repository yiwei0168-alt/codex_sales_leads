import { tenantQuery } from "@/lib/rag/db";
import { decryptMailboxContent } from "@/lib/mailbox/crypto";
export async function followUpContext(userId:string,parentId:string){
  const rows=await tenantQuery<{id:string;workspace_id:string;company_id:string;content_ciphertext:string;country_code:string;role:string|null}>(userId,
    `select m.id,m.workspace_id,m.company_id,m.content_ciphertext,c.country_code,coalesce(wc.user_overrides->>'primaryBusinessRole',c.record->>'primaryBusinessRole') as role
     from outbound_mail m join sales_company c on c.id=m.company_id join workspace_company wc on wc.company_id=m.company_id and wc.workspace_id=m.workspace_id
     where m.user_id=$1 and m.id=$2 and m.status='sent'`,[userId,parentId]);
  if(!rows[0])return null;const root=rows[0];const original=decryptMailboxContent(userId,root.content_ciphertext);
  const [ancestors,memories]=await Promise.all([
    tenantQuery<{id:string;content_ciphertext:string;sent_at:string}>(userId,`with recursive chain as (
      select id,parent_id,user_id,company_id,content_ciphertext,sent_at,1 as depth from outbound_mail where user_id=$1 and id=$2
      union all select p.id,p.parent_id,p.user_id,p.company_id,p.content_ciphertext,p.sent_at,c.depth+1 from outbound_mail p join chain c on p.id=c.parent_id
      where p.user_id=$1 and p.company_id=$3 and c.depth<8 and p.status='sent'
    ) select id,content_ciphertext,sent_at::text from chain order by depth desc`,[userId,parentId,root.company_id]),
    tenantQuery<{id:string;content:string}>(userId,`select id,content from user_outreach_memory where user_id=$1 and status='active' and kind='email-style'
      and (workspace_id is null or workspace_id=$2) and (cardinality(market_codes)=0 or $3=any(market_codes))
      and (cardinality(channel_roles)=0 or $4=any(channel_roles)) order by updated_at desc,id desc limit 4`,[userId,root.workspace_id,root.country_code,root.role])
  ]);
  const chain=ancestors.map(item=>({id:item.id,sentAt:item.sent_at,...decryptMailboxContent(userId,item.content_ciphertext)}))
    .filter(item=>item.recipients.join(',')===original.recipients.join(',')&&item.sender.join(',')===original.sender.join(','));
  return {workspaceId:root.workspace_id,original,thread:chain.map(item=>({sentAt:item.sentAt,subject:item.subject,body:item.bodyText.slice(0,2000)})),
    stylePreferences:memories.map(item=>({id:item.id,content:item.content.slice(0,1200)})),threadTruncated:ancestors.length>=8||chain.some(item=>item.bodyText.length>2000)};
}
