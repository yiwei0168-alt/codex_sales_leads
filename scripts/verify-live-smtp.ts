import nextEnv from "@next/env";
import {createHash} from "node:crypto";
import {z} from "zod";
nextEnv.loadEnvConfig(process.cwd());
const {query,tenantQuery,getPool}=await import("../src/lib/rag/db");
const {verifyOutbound,sendOutbound,listOutbound}=await import("../src/lib/mailbox/outbound");
const {addManualCompany}=await import("../src/lib/sales/manual-company");
const runId="local-production-acceptance-2026-09-12";
let phase="configuration";
try{
  const owners=await query<{owner_id:string}>("select distinct w.owner_id from market_workspace w join app_user u on u.id=w.owner_id where w.slug='global-sales' and w.status='active' and u.status='active'");
  if(owners.length!==1)throw new Error("ambiguous-owner");const userId=owners[0].owner_id;
  const connections=await tenantQuery<{id:string}>(userId,"select id from mailbox_connection where user_id=$1 and status='active'",[userId]);
  if(connections.length!==1)throw new Error("ambiguous-mailbox");
  if(process.argv.includes("--status")){
    const receipts=await tenantQuery(userId,"select status,count(*)::int as count from outbound_mail where user_id=$1 and company_id in (select id from sales_company where domain=$2) group by status",[userId,`smtp-${runId}.invalid`]);
    console.log(JSON.stringify({testReceipts:receipts,sendRequested:false,modelCalls:0}));
  }else if(!process.argv.includes("--send")){console.log(JSON.stringify({ready:true,connectedMailboxes:1,sendRequested:false,modelCalls:0}));}
  else{
    const to=z.email().parse(process.env.ACCEPTANCE_SMTP_RECIPIENT);
    const hash=createHash("sha256").update(`${runId}:${userId}:${to}`).digest("hex");
    const idempotencyKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
    // Real receipt remains auditable on a clearly synthetic node; never mark a customer contacted.
    const testCompany=await addManualCompany(userId,{name:"[TEST ONLY] Local production SMTP acceptance",country:"GB",website:`https://smtp-${runId}.invalid`});
    const previous=await tenantQuery<{id:string;status:string}>(userId,"select id,status from outbound_mail where user_id=$1 and idempotency_key=$2",[userId,idempotencyKey]);
    phase="smtp-verify";
    if(!previous.length)await verifyOutbound(userId,connections[0].id);
    phase="smtp-send";
    const result=await sendOutbound(userId,{connectionId:connections[0].id,companyExternalId:testCompany.externalId,to,
      subject:"[产品验收测试] SMTP发送链路",
      body:"你好，\n\n这是一封由 Network Channel Copilot 产品发送的本地生产构建验收测试邮件，仅用于验证 SMTP 发送、发送时间和产品内记录。\n\n邮件不含客户资料或业务承诺，无需回复。\n\nNetwork Channel Copilot 验收测试",
      idempotencyKey,confirmed:true});
    const receipts=await listOutbound(userId,testCompany.externalId);
    const receipt=receipts.find(item=>item.id===result.id);
    console.log(JSON.stringify({smtpStatus:result.status,reused:result.reused,receiptSaved:Boolean(receipt),sentTimeSaved:Boolean(receipt?.sentAt),encryptedPayloadRoundTrip:receipt?.recipients[0]===to,modelCalls:0,deliveryToInbox:"unverified",testNodeRetained:true}));
    if(result.status!=="sent"||!receipt?.sentAt)process.exitCode=1;
  }
}catch(error){
  // Provider messages can contain addresses or credentials. Persist no raw error.
  const code=error&&typeof error==="object"&&"code"in error?String(error.code):"verification-failed";
  console.error(JSON.stringify({smtpAcceptance:"failed-or-unknown",phase,code:/^[A-Z0-9_]{1,40}$/.test(code)?code:"verification-failed",automaticRetry:false}));process.exitCode=1;
}finally{await getPool().end();}
