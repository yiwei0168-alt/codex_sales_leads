import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const offset=Number(new URL(request.url).searchParams.get("offset")??0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return Response.json({error:"分页参数无效"},{status:400});
  const startedAt=Date.now();
  try{const rows=await tenantQuery(session.userId,`select id,memory_id as "memoryId",operation,changed_fields as "changedFields",
    before_state as "beforeState",after_state as "afterState",created_at::text as "createdAt"
    from user_memory_audit where user_id=$1 order by created_at desc,id desc limit 51 offset $2`,[session.userId,offset]);
    console.info(JSON.stringify({event:"workflow-efficiency",stage:"memory-audit-read",version:"ui-v1.1-4d",inputItems:rows.length,
      validOutputItems:Math.min(rows.length,50),downstreamUsedItems:Math.min(rows.length,50),usageBoundary:"api-projection",
      inputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,databaseCostUsd:null,latencyMs:Date.now()-startedAt,retries:0,
      discardedReasonCounts:rows.length>50?{paginationSentinel:1}:{},utilizationEfficiency:rows.length?Math.min(rows.length,50)/rows.length:null,
      optimizationOpportunity:"Lazy-load audit summaries without copying memory bodies"}));
    return Response.json({items:rows.slice(0,50),hasMore:rows.length>50},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"历史记录读取失败"},{status:503});}
}
