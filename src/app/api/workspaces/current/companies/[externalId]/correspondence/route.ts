import {requireApiSession} from "@/lib/auth/session";
import {tenantQuery} from "@/lib/rag/db";
import {decryptMailboxContent} from "@/lib/mailbox/crypto";
import {startOperation,finishOperation,bestEffortMetric} from "@/lib/operation-metrics";
export async function GET(request:Request,{params}:{params:Promise<{externalId:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {externalId}=await params;const offset=Number(new URL(request.url).searchParams.get("offset")??0);
  if(!externalId||externalId.length>180||!Number.isSafeInteger(offset)||offset<0||offset>100000)return Response.json({error:"公司或分页参数无效"},{status:400});
  const started=Date.now();let operationId:string|undefined;let fetched=0,projected=0,success=false;
  try{
    operationId=await startOperation(session.userId,"company-correspondence-read",1,0);
    const rows=await tenantQuery<{id:string;direction:string;sentAt:string|null;source:string;content_ciphertext:string|null;subject:string}>(session.userId,`select m.id,m.direction,m.sent_at::text as "sentAt",l.source,m.content_ciphertext,m.subject
      from mailbox_message_company l join mailbox_message m on m.id=l.message_id and m.user_id=l.user_id
      join sales_company c on c.id=l.company_id join workspace_company wc on wc.company_id=c.id
      join market_workspace w on w.id=wc.workspace_id
      where l.user_id=$1 and w.owner_id=$1 and w.slug='global-sales' and c.external_id=$2 and l.source in ('domain-match','user-confirmed')
      order by m.sent_at desc nulls last,m.id desc limit 21 offset $3`,[session.userId,externalId,offset]);
    fetched=rows.length;const messages=rows.slice(0,20).map(row=>({id:row.id,direction:row.direction,sentAt:row.sentAt,source:row.source,subject:row.content_ciphertext?decryptMailboxContent(session.userId,row.content_ciphertext).subject:row.subject}));
    projected=messages.length;success=true;return Response.json({messages,hasMore:rows.length>20},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"已关联邮件暂不可读取"},{status:503});}
  finally{if(operationId)await bestEffortMetric(()=>finishOperation(session.userId,operationId!,success?"completed":"failed",{inputItems:1,inputCharacters:0,outputItems:fetched,validOutputItems:projected,downstreamUsedItems:projected,
    inputTokens:0,cachedInputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs:Date.now()-started,retries:0,discardedReasonCounts:!success?{readFailure:1}:fetched>projected?{paginationSentinel:1}:{},utilizationEfficiency:fetched?projected/fetched:null,
    usageBoundary:"mail-metadata-api-projection",optimizationOpportunity:"Use persisted links; fetch body only on explicit expansion without mailbox sync or inference"}));}
}
