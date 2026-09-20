import {requireApiSession} from "@/lib/auth/session";
import {listCompanyCorrespondence} from "@/lib/sales/company-detail-read";
import {startOperation,finishOperation,bestEffortMetric} from "@/lib/operation-metrics";
export async function GET(request:Request,{params}:{params:Promise<{externalId:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {externalId}=await params;const offset=Number(new URL(request.url).searchParams.get("offset")??0);
  if(!externalId||externalId.length>180||!Number.isSafeInteger(offset)||offset<0||offset>100000)return Response.json({error:"公司或分页参数无效"},{status:400});
  const started=Date.now();let operationId:string|undefined;let fetched=0,projected=0,success=false;
  try{
    operationId=await startOperation(session.userId,"company-correspondence-read",1,0);
    const page=await listCompanyCorrespondence(session.userId,externalId,offset);
    fetched=page.fetched;projected=page.messages.length;success=true;return Response.json({messages:page.messages,hasMore:page.hasMore},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"已关联邮件暂不可读取"},{status:503});}
  finally{if(operationId)await bestEffortMetric(()=>finishOperation(session.userId,operationId!,success?"completed":"failed",{inputItems:1,inputCharacters:0,outputItems:fetched,validOutputItems:projected,downstreamUsedItems:projected,
    inputTokens:0,cachedInputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs:Date.now()-started,retries:0,discardedReasonCounts:!success?{readFailure:1}:fetched>projected?{paginationSentinel:1}:{},utilizationEfficiency:fetched?projected/fetched:null,
    usageBoundary:"mail-metadata-api-projection",optimizationOpportunity:"Use persisted links; fetch body only on explicit expansion without mailbox sync or inference"}));}
}
