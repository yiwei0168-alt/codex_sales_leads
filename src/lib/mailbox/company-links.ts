import type { PoolClient } from "pg";
import { tenantQuery,tenantTransaction } from "@/lib/rag/db";
export function externalAddressDomains(addresses:string[],ownEmail:string){
  const ownDomain=ownEmail.split('@')[1]?.toLowerCase();return [...new Set(addresses.map(address=>address.split('@')[1]?.toLowerCase()).filter((domain):domain is string=>Boolean(domain&&domain!==ownDomain)))];
}
export async function matchImportedCompany(client:PoolClient,userId:string,messageId:string,addresses:string[],ownEmail:string){
  const domains=externalAddressDomains(addresses,ownEmail);
  const candidates=await client.query<{id:string}>(`select distinct c.id from sales_company c join workspace_company wc on wc.company_id=c.id
    join market_workspace w on w.id=wc.workspace_id where w.owner_id=$1 and w.slug='global-sales' and lower(c.domain)=any($2::text[])`,[userId,domains]);
  const companyId=candidates.rows.length===1?candidates.rows[0].id:null;
  await client.query(`insert into mailbox_message_company(user_id,message_id,company_id,source) values($1,$2,$3,$4)
    on conflict(user_id,message_id) do nothing`,[userId,messageId,companyId,companyId?'domain-match':'ambiguous']);
}
export async function messageCompanyLink(userId:string,messageId:string){
  const rows=await tenantQuery(userId,`select l.source,c.external_id as "companyId",c.canonical_name as "companyName" from mailbox_message m
    left join mailbox_message_company l on l.message_id=m.id and l.user_id=m.user_id left join sales_company c on c.id=l.company_id
    where m.user_id=$1 and m.id=$2`,[userId,messageId]);return rows[0]??null;
}
export async function setMessageCompany(userId:string,messageId:string,externalId:string|null){
  return tenantTransaction(userId,async client=>{
    const message=await client.query("select id from mailbox_message where user_id=$1 and id=$2 for update",[userId,messageId]);if(!message.rowCount)return false;
    let companyId:string|null=null;
    if(externalId){const rows=await client.query<{id:string}>(`select c.id from sales_company c join user_company_market wc on wc.company_id=c.id join market_workspace w on w.id=wc.workspace_id
      where w.owner_id=$1 and w.slug='global-sales' and wc.candidate_id=$2`,[userId,externalId]);if(!rows.rows[0])throw new Error("公司不属于当前用户");companyId=rows.rows[0].id;}
    await client.query(`insert into mailbox_message_company(user_id,message_id,company_id,source) values($1,$2,$3,$4)
      on conflict(user_id,message_id) do update set company_id=excluded.company_id,source=excluded.source,updated_at=now()`,[userId,messageId,companyId,companyId?'user-confirmed':'user-rejected']);return true;
  });
}
