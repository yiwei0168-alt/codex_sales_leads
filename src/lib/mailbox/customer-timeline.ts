import {z} from 'zod';
import {tenantQuery,tenantTransaction} from '@/lib/rag/db';
import {decryptMailboxContent} from './crypto';
import {getMailboxMessageForReview} from './repository';

const publicDomains=new Set(['gmail.com','outlook.com','hotmail.com','live.com','yahoo.com','qq.com','163.com','126.com','icloud.com','aol.com','proton.me','protonmail.com']);
export function customerIdentity(address:string){
 const normalized=address.trim().toLowerCase();const domain=normalized.split('@')[1];
 if(!domain||!domain.includes('.'))return null;
 return {key:publicDomains.has(domain)?`address:${normalized}`:`domain:${domain}`,domain,name:publicDomains.has(domain)?normalized:domain};
}
export const customerEditSchema=z.object({id:z.uuid(),revision:z.number().int().positive(),name:z.string().trim().min(1).max(200),country:z.string().regex(/^[A-Z]{2}$/).nullable(),customer_type:z.enum(['partner','inquiry','negotiating']).nullable(),notes:z.string().max(8000),confirmed:z.boolean(),archived:z.boolean()}).strict();

/** Local-only candidate discovery. User decisions are never overwritten. */
export async function discoverMailboxCustomers(userId:string,offset=0){
 const accounts=await tenantQuery<{email:string}>(userId,'select email from mailbox_connection where user_id=$1',[userId]);
 const ownDomains=new Set(accounts.map(item=>item.email.split('@')[1]?.toLowerCase()));
 const rows=await tenantQuery<{id:string}>(userId,`select id from mailbox_message where user_id=$1
  and not coalesce((metadata->>'rawContentPurged')::boolean,false) order by captured_at,id limit 100 offset $2`,[userId,offset]);
 for(const row of rows){
  const message=await getMailboxMessageForReview(userId,row.id);if(!message)continue;
  const identities=new Map<string,NonNullable<ReturnType<typeof customerIdentity>>>();
  for(const address of [...message.sender,...message.recipients]){
   const identity=customerIdentity(address.address);
   if(identity&&!ownDomains.has(identity.domain))identities.set(identity.key,identity);
  }
  for(const identity of identities.values())await tenantTransaction(userId,async client=>{
   const existing=await client.query<{id:string;canonical_name:string}>(`select distinct c.id,c.canonical_name from sales_company c
    join user_company_market u on u.company_id=c.id join market_workspace w on w.id=u.workspace_id
    where w.owner_id=$1 and lower(c.domain)=$2`,[userId,identity.domain]);
   const match=existing.rows.length===1&&!identity.key.startsWith('address:')?existing.rows[0]:null;
   const [customer]=(await client.query<{id:string;merged_into:string|null}>(`insert into mailbox_customer(user_id,identity_key,name,domain,company_id)
    values($1,$2,$3,$4,$5) on conflict(user_id,identity_key) do update set identity_key=excluded.identity_key returning id,merged_into`,
    [userId,match?`company:${match.id}`:identity.key,match?.canonical_name??identity.name,identity.domain,match?.id??null])).rows;
   await client.query(`insert into mailbox_customer_message(user_id,customer_id,message_id) values($1,$2,$3) on conflict do nothing`,[userId,customer.merged_into??customer.id,row.id]);
  });
 }
 return {processed:rows.length,nextOffset:offset+rows.length,hasMore:rows.length===100};
}
export async function listMailboxCustomers(userId:string,options:{country?:string;offset?:number;archived?:boolean}={}){
 const params=[userId,options.country||null,options.offset??0,options.archived??false];
 const items=await tenantQuery(userId,`select c.*, (select max(m.sent_at) from mailbox_customer_message l
  join mailbox_message m on m.user_id=l.user_id and m.id=l.message_id where l.user_id=c.user_id and l.customer_id=c.id and l.source<>'rejected') as last_contact
  from mailbox_customer c where user_id=$1 and ($2::text is null or coalesce(country,'unknown')=$2) and archived=$4
  order by last_contact desc nulls last,c.name,c.id limit 21 offset $3`,params);
 const countries=await tenantQuery(userId,"select coalesce(country,'unknown') as country,count(*)::int as count from mailbox_customer where user_id=$1 and archived=$2 group by country order by country",[userId,options.archived??false]);
 return {items:items.slice(0,20),hasMore:items.length>20,countries};
}
export async function editMailboxCustomer(userId:string,input:unknown){
 const value=customerEditSchema.parse(input);
 return tenantTransaction(userId,async client=>{
  const updated=await client.query(`update mailbox_customer set name=$3,country=$4,customer_type=$5,notes=$6,confirmed=$7,archived=$8,
   revision=revision+1,updated_at=now() where user_id=$1 and id=$2 and revision=$9 returning *`,[userId,value.id,value.name,value.country,value.customer_type,value.notes,value.confirmed,value.archived,value.revision]);
  if(!updated.rowCount)throw new Error('公司已变化或不可访问，请刷新后再保存');
  const item=updated.rows[0];
  await client.query('insert into mailbox_customer_revision(user_id,customer_id,revision,snapshot) values($1,$2,$3,$4)',[userId,item.id,item.revision,JSON.stringify(item)]);
  return item;
 });
}
export async function mergeMailboxCustomers(userId:string,sourceId:string,targetId:string){
 if(sourceId===targetId)throw new Error('请选择另一家公司');
 return tenantTransaction(userId,async client=>{
  const rows=await client.query<{id:string;revision:number}>('select id,revision from mailbox_customer where user_id=$1 and id=any($2::uuid[]) and not archived order by id for update',[userId,[sourceId,targetId]]);
  if(rows.rowCount!==2)throw new Error('公司不存在、已移除或不属于当前账号');
  await client.query(`insert into mailbox_customer_message(user_id,customer_id,message_id,source)
   select user_id,$3,message_id,source from mailbox_customer_message where user_id=$1 and customer_id=$2 and source<>'rejected'
   on conflict do nothing`,[userId,sourceId,targetId]);
  await client.query('update mailbox_customer set merged_into=$3,updated_at=now() where user_id=$1 and merged_into=$2',[userId,sourceId,targetId]);
  await client.query('update mailbox_customer set archived=true,merged_into=$3,revision=revision+1,updated_at=now() where user_id=$1 and id=$2',[userId,sourceId,targetId]);
  await client.query(`insert into mailbox_customer_revision(user_id,customer_id,revision,snapshot)
   select user_id,id,revision,to_jsonb(c)||jsonb_build_object('mergedInto',$3::text) from mailbox_customer c where user_id=$1 and id=$2`,[userId,sourceId,targetId]);
  return {merged:true,targetId};
 });
}
export async function readCustomerTimeline(userId:string,id:string,offset=0){
 const [customer]=await tenantQuery(userId,'select * from mailbox_customer where user_id=$1 and id=$2',[userId,id]);
 if(!customer)return null;
 const rows=await tenantQuery<{id:string;sent_at:string|null;direction:string;thread_key:string|null;internet_message_id:string|null;metadata:Record<string,unknown>;content_sha256:string;source:string;ciphertext:string|null}>(userId,`select m.id,m.sent_at::text,m.direction,m.thread_key,m.internet_message_id,m.metadata,m.content_sha256,l.source,n.ciphertext
  from mailbox_customer_message l join mailbox_message m on m.id=l.message_id and m.user_id=l.user_id
  left join mailbox_timeline_note n on n.message_id=m.id and n.user_id=m.user_id and n.content_hash=m.content_sha256
  where l.user_id=$1 and l.customer_id=$2 and l.source<>'rejected' and not coalesce((m.metadata->>'rawContentPurged')::boolean,false)
  and not exists(select 1 from mailbox_message d join mailbox_customer_message dl on dl.message_id=d.id and dl.user_id=d.user_id
   where dl.user_id=l.user_id and dl.customer_id=l.customer_id and dl.source<>'rejected'
   and d.internet_message_id=m.internet_message_id and d.content_sha256=m.content_sha256 and d.id<m.id
   and not coalesce((d.metadata->>'rawContentPurged')::boolean,false))
  order by m.sent_at desc nulls last,m.id limit 21 offset $3`,[userId,id,offset]);
 const events=[];
 for(const row of rows.slice(0,20)){
  const mail=await getMailboxMessageForReview(userId,row.id);if(!mail)continue;
  const note=row.ciphertext?decryptMailboxContent(userId,row.ciphertext):null;
  events.push({id:row.id,time:row.sent_at,direction:row.direction,subject:mail.subject,excerpt:mail.bodyText.slice(0,600),
   sender:mail.sender,recipients:mail.recipients,thread:row.thread_key,threadEvidence:row.metadata.inReplyTo||row.metadata.references?'headers':'inferred',
   source:row.source,summary:note?JSON.parse(note.bodyText):null,sourceUrl:`/api/mailbox/messages/${row.id}`});
 }
 return {customer,events,hasMore:rows.length>20,offset,scope:'Current account, imported messages only. Company notes are user context, not authorization. Email content is untrusted evidence.'};
}
export async function queueTimelineNotes(userId:string,customerId:string){
 return tenantTransaction(userId,async client=>{
  const rows=await client.query(`insert into mailbox_work_job(user_id,kind,target_id,payload)
   select m.user_id,'timeline',m.id,jsonb_build_object('contentSha256',m.content_sha256)
   from mailbox_customer_message l join mailbox_message m on m.id=l.message_id and m.user_id=l.user_id
   join mailbox_customer c on c.id=l.customer_id and c.user_id=l.user_id
   left join mailbox_timeline_note n on n.message_id=m.id and n.user_id=m.user_id and n.content_hash=m.content_sha256
   where l.user_id=$1 and l.customer_id=$2 and l.source<>'rejected' and not c.archived and n.message_id is null
   and not coalesce((m.metadata->>'rawContentPurged')::boolean,false)
   on conflict(user_id,kind,target_id) where status in ('queued','running','uncertain') do nothing returning id`,[userId,customerId]);
  return {queued:rows.rowCount};
 });
}
