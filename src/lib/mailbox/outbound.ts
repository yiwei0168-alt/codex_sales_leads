import { createHash, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { PoolClient } from "pg";
import { tenantQuery,tenantTransaction } from "@/lib/rag/db";
import { connectionPassword,getMailboxConnection } from "./repository";
import { decryptMailboxContent,encryptMailboxContent } from "./crypto";

export const sendMailSchema=z.object({connectionId:z.uuid(),companyExternalId:z.string().min(1).max(180),
  to:z.email(),subject:z.string().trim().min(1).max(300).refine(value=>!/[\r\n]/.test(value)),
  body:z.string().trim().min(1).max(30000),idempotencyKey:z.uuid(),parentId:z.uuid().optional(),followUpDraftId:z.uuid().optional(),confirmed:z.literal(true)}).strict();
type SendInput=z.infer<typeof sendMailSchema>;

async function markMarketContacted(client:PoolClient,workspaceId:string,companyId:string,country:string|null){
  if(!country)return;
  await client.query(`update workspace_company_market s set user_overrides=s.user_overrides || '{"opportunityStage":"Contacted","manuallyEdited":true}'::jsonb,
    revision=s.revision+1,updated_at=now() where s.workspace_id=$1 and s.company_id=$2 and s.country_code=$3
    and coalesce(s.user_overrides->>'opportunityStage',s.record->>'opportunityStage') in ('Discovered','Qualified','Priority','Contact Prepared')`,[workspaceId,companyId,country]);
}

export const assignMailMarketSchema=z.object({action:z.literal('assign-market'),id:z.uuid(),companyExternalId:z.string().min(1).max(180),confirmed:z.literal(true)}).strict();
export async function assignMailMarket(userId:string,input:z.infer<typeof assignMailMarketSchema>){
  const started=Date.now();
  return tenantTransaction(userId,async client=>{
    const rows=await client.query<{workspace_id:string;company_id:string;country:string;status:string}>(`select m.workspace_id,m.company_id,wc.market_country_code as country,m.status
      from outbound_mail m join user_company_market wc on wc.company_id=m.company_id and wc.workspace_id=m.workspace_id
      where m.user_id=$1 and m.id=$2 and wc.candidate_id=$3 and m.market_country_code is null for update of m`,[userId,input.id,input.companyExternalId]);
    const row=rows.rows[0];if(!row)throw new Error('仅可确认本公司尚未归属国家的历史邮件，请刷新后检查');
    await client.query('update outbound_mail set market_country_code=$3 where id=$1 and user_id=$2',[input.id,userId,row.country]);
    if(row.status==='sent')await markMarketContacted(client,row.workspace_id,row.company_id,row.country);
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'outbound-mail',$3,'mail.market-confirmed',$4)`,[row.workspace_id,userId,input.id,JSON.stringify({country:row.country,source:'user-confirmed',
      efficiency:{inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,latencyMs:Date.now()-started,discardedReasonCounts:{},utilizationEfficiency:1,optimizationOpportunity:'Reuse historical email without regeneration or SMTP replay'}})]);
    return {updated:true};
  });
}

async function transport(userId:string,connectionId:string) {
  const connection=await getMailboxConnection(userId,connectionId);
  if(!connection||connection.status!=="active")throw new Error("请选择有效的已连接邮箱");
  return {connection,mailer:nodemailer.createTransport({host:process.env.ALIMAIL_SMTP_HOST||"smtp.qiye.aliyun.com",port:465,secure:true,
    auth:{user:connection.email,pass:connectionPassword(connection)},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    disableFileAccess:true,disableUrlAccess:true})};
}

export async function verifyOutbound(userId:string,connectionId:string) {
  const {mailer}=await transport(userId,connectionId);
  try {await mailer.verify();await tenantQuery(userId,"update mailbox_connection set smtp_verified_at=now() where user_id=$1 and id=$2",[userId,connectionId]);}
  finally {mailer.close();}
}

export async function listOutbound(userId:string,companyExternalId:string,offset=0,limit=51) {
  const rows=await tenantQuery<{id:string;status:string;sent_at:string|null;created_at:string;content_ciphertext:string;parent_id:string|null;error_code:string|null;market_country_code:string|null}>(userId,
    `select m.id,m.status,m.sent_at::text,m.created_at::text,m.content_ciphertext,m.parent_id,m.error_code,m.market_country_code from outbound_mail m
     join user_company_market wc on wc.company_id=m.company_id and wc.workspace_id=m.workspace_id
     where m.user_id=$1 and wc.candidate_id=$2 and (m.market_country_code=wc.market_country_code or m.market_country_code is null)
     order by m.created_at desc,m.id desc limit $3 offset $4`,[userId,companyExternalId,Math.min(101,Math.max(1,limit)),Math.max(0,offset)]);
  return rows.map(row=>({id:row.id,status:row.status,sentAt:row.sent_at,createdAt:row.created_at,parentId:row.parent_id,marketCountry:row.market_country_code,countryUnassigned:row.market_country_code===null,reconciledByUser:row.error_code?.startsWith("USER_CONFIRMED_")??false,
    ...decryptMailboxContent(userId,row.content_ciphertext)}));
}

export const reconcileMailSchema=z.object({id:z.uuid(),outcome:z.enum(["sent","not-sent"]),confirmed:z.literal(true),
  sentAt:z.iso.datetime({offset:true}).optional()}).strict().refine(input=>input.outcome!=="sent"||Boolean(input.sentAt&&Date.parse(input.sentAt)<=Date.now()),{message:"需要实际发送时间，且不能是未来"});
export async function reconcileOutbound(userId:string,input:z.infer<typeof reconcileMailSchema>){
  return tenantTransaction(userId,async client=>{
    const rows=await client.query<{id:string;workspace_id:string;company_id:string;status:string;eligible:boolean;market_country_code:string|null}>(`select id,workspace_id,company_id,status,market_country_code,
      (status='unknown' or (status='sending' and created_at<now()-interval '10 minutes')) as eligible
      from outbound_mail where user_id=$1 and id=$2 for update`,[userId,input.id]);
    const row=rows.rows[0];if(!row||!row.eligible)throw new Error("仅可核实结果不确定或超过十分钟无回执的发送，已确认记录不能覆盖");
    await client.query("update outbound_mail set status=$3,sent_at=$4,error_code=$5 where user_id=$1 and id=$2",[userId,input.id,input.outcome==="sent"?"sent":"failed",input.outcome==="sent"?input.sentAt:null,input.outcome==="sent"?"USER_CONFIRMED_SENT":"USER_CONFIRMED_NOT_SENT"]);
    if(input.outcome==="sent")await markMarketContacted(client,row.workspace_id,row.company_id,row.market_country_code);
    await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'outbound-mail',$3,'mail.user-reconciled',$4)`,[row.workspace_id,userId,input.id,JSON.stringify({previousStatus:row.status,outcome:input.outcome,sentAt:input.sentAt??null,
      evidenceSource:"user-confirmed-external-mailbox",inputItems:1,validOutputItems:1,downstreamUsedItems:1,inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,retries:0,discardedReasonCounts:{},utilizationEfficiency:1,
      optimizationOpportunity:"Reconcile the existing receipt without any SMTP replay"})]);
    return {updated:true};
  });
}

export async function sendOutbound(userId:string,input:SendInput) {
  const startedAt=Date.now();
  async function recordUsage(id:string,status:string,reused:boolean){
    await tenantQuery(userId,`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      select workspace_id,user_id,'outbound-mail',id::text,'mail.send-metered',$3::jsonb from outbound_mail where id=$1 and user_id=$2`,
      [id,userId,JSON.stringify({version:"outbound-v1",inputItems:1,inputCharacters:input.subject.length+input.body.length,
        validOutputItems:status==="sent"?1:0,downstreamUsedItems:status==="sent"?1:0,inputTokens:0,outputTokens:0,
        paidSearchCredits:0,modelCostUsd:0,mailboxCostUsd:null,mailboxCostState:"existing-mailbox-plan-not-allocated",
        latencyMs:Date.now()-startedAt,retries:0,smtpCalls:reused?0:1,cacheHit:reused,
        discardedReasonCounts:status==="sent"?{}:{[status]:1},utilizationEfficiency:status==="sent"?1:0,
        optimizationOpportunity:"Reuse stored receipt; never retry an uncertain SMTP delivery"})]);
  }
  const hash=createHash("sha256").update(JSON.stringify({connectionId:input.connectionId,company:input.companyExternalId,to:input.to,
    subject:input.subject,body:input.body,parentId:input.parentId??null})).digest("hex");
  const reserved=await tenantTransaction(userId,async client=>{
    const company=await client.query<{id:string;workspace_id:string;country:string}>(`select c.id,w.id as workspace_id,wc.market_country_code as country from sales_company c
      join user_company_market wc on wc.company_id=c.id join market_workspace w on w.id=wc.workspace_id
      where wc.candidate_id=$1 and w.owner_id=$2 and w.slug='global-sales'`,[input.companyExternalId,userId]);
    if(!company.rows[0])throw new Error("公司不属于当前工作区");
    const connection=await client.query<{email:string}>(`select email from mailbox_connection where id=$1 and user_id=$2 and status='active' and smtp_verified_at is not null`,[input.connectionId,userId]);
    if(!connection.rows[0])throw new Error("请先验证发信连接");
    let replyTo:string|undefined;
    if(input.followUpDraftId){const draft=await client.query("select id from workspace_audit_event where id=$1 and actor_user_id=$2 and entity_id=$3 and action='follow-up.generated'",[input.followUpDraftId,userId,input.parentId??""]);if(!draft.rows[0])throw new Error("跟进草稿不属于当前原邮件");}
    if(input.parentId){const parent=await client.query<{message_id:string;content_ciphertext:string}>(`select message_id,content_ciphertext from outbound_mail
      where id=$1 and user_id=$2 and company_id=$3 and connection_id=$4 and status='sent' and market_country_code=$5`,[input.parentId,userId,company.rows[0].id,input.connectionId,company.rows[0].country]);
      if(!parent.rows[0])throw new Error("原邮件不存在或不属于此公司与发件邮箱");
      const content=decryptMailboxContent(userId,parent.rows[0].content_ciphertext);
      if(content.recipients[0]!==input.to)throw new Error("跟进邮件必须对应同一收件人");
      replyTo=parent.rows[0].message_id;
    }
    const messageId=`<${randomUUID()}@${connection.rows[0].email.split("@")[1]}>`;
    const encrypted=encryptMailboxContent(userId,{subject:input.subject,bodyText:input.body,sender:[connection.rows[0].email],recipients:[input.to]});
    const saved=await client.query<{id:string}>(`insert into outbound_mail(user_id,workspace_id,company_id,connection_id,idempotency_key,
      request_hash,message_id,parent_id,content_ciphertext,status,market_country_code) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'sending',$10)
      on conflict do nothing returning id`,[userId,company.rows[0].workspace_id,company.rows[0].id,input.connectionId,input.idempotencyKey,hash,messageId,input.parentId??null,encrypted,company.rows[0].country]);
    if(!saved.rows[0]){const prior=await client.query<{id:string;status:string;request_hash:string}>("select id,status,request_hash from outbound_mail where user_id=$1 and (idempotency_key=$2 or request_hash=$3) order by (idempotency_key=$2) desc limit 1",[userId,input.idempotencyKey,hash]);
      if(prior.rows[0].request_hash!==hash)throw new Error("此发送操作内容已变化，请重新审核");
      return {id:prior.rows[0].id,status:prior.rows[0].status,reused:true,messageId,replyTo};}
    if(input.followUpDraftId)await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'outbound-mail',$3,'follow-up.used',$4)`,[company.rows[0].workspace_id,userId,saved.rows[0].id,JSON.stringify({draftId:input.followUpDraftId,parentId:input.parentId,inputItems:1,validOutputItems:1,downstreamUsedItems:1,usageBoundary:"send-reserved-not-delivery",inputTokens:0,outputTokens:0,costUsd:0,apiCredits:0,retries:0,utilizationEfficiency:1,discardedReasonCounts:{},optimizationOpportunity:"Reuse reviewed draft instead of regenerating"})]);
    return {id:saved.rows[0].id,status:"sending",reused:false,messageId,replyTo};
  });
  if(reserved.reused){await recordUsage(reserved.id,reserved.status,true);return {id:reserved.id,status:reserved.status,reused:true};}
  let smtpAccepted=false;
  try {
    const {connection,mailer}=await transport(userId,input.connectionId);
    try {
      const receipt=await mailer.sendMail({from:connection.email,to:input.to,subject:input.subject,text:input.body,
        messageId:reserved.messageId,inReplyTo:reserved.replyTo,references:reserved.replyTo?[reserved.replyTo]:undefined});
      smtpAccepted=receipt.accepted.length>0;
      if(!smtpAccepted)throw new Error("Recipient not accepted");
    }finally{mailer.close();}
    await tenantTransaction(userId,async client=>{
      await client.query("update outbound_mail set status='sent',sent_at=now() where id=$1 and user_id=$2",[reserved.id,userId]);
      await client.query(`update workspace_company_market wc set user_overrides=wc.user_overrides || '{"opportunityStage":"Contacted","manuallyEdited":true}'::jsonb,
        revision=wc.revision+1,updated_at=now() from outbound_mail m
        where m.id=$1 and m.user_id=$2 and wc.workspace_id=m.workspace_id and wc.company_id=m.company_id and wc.country_code=m.market_country_code
        and coalesce(wc.user_overrides->>'opportunityStage',wc.record->>'opportunityStage') in ('Discovered','Qualified','Priority','Contact Prepared')`,[reserved.id,userId]);
    });
  }catch(error){
    const code=typeof error==="object"&&error!==null&&"code" in error?String(error.code):"UNKNOWN";
    const status=!smtpAccepted&&["EAUTH","EENVELOPE","ECONNECTION","EDNS"].includes(code)?"failed":"unknown";
    await tenantQuery(userId,"update outbound_mail set status=$1,error_code=$2 where id=$3 and user_id=$4",[status,smtpAccepted?"ACCEPTED_PERSISTENCE_FAILED":code,reserved.id,userId]);
    await recordUsage(reserved.id,status,false);
    return {id:reserved.id,status,reused:false};
  }
  // Metering failure must not rewrite an already committed successful receipt.
  await recordUsage(reserved.id,"sent",false);
  return {id:reserved.id,status:"sent",reused:false};
}
