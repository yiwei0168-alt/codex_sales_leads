import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { taskFeedSourceSql } from "@/lib/assistant/task-feed";
import { startOperation,finishOperation,bestEffortMetric } from "@/lib/operation-metrics";
export async function GET(){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const started=Date.now();let operationId:string|undefined;
  let rows:Array<{country:string;active:number}>|undefined;
  try{
    operationId=await startOperation(session.userId,"market-task-counts",1,0);
    rows=await tenantQuery(session.userId,`${taskFeedSourceSql}
      select case when country ~ '^[A-Z]{2}$' then country else 'unknown' end as country,count(*)::int as active
      from feed where status in ('running','confirmed','sending') group by 1 order by 1`,[session.userId]);
    return Response.json({markets:rows,asOf:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"运行任务统计暂不可用"},{status:503});}
  finally{if(operationId)await bestEffortMetric(()=>finishOperation(session.userId,operationId!,rows?"completed":"failed",{
    inputItems:1,inputCharacters:0,outputItems:rows?.length??0,validOutputItems:rows?.length??0,downstreamUsedItems:rows?.length??0,
    inputTokens:0,cachedInputTokens:0,outputTokens:0,apiCredits:0,costUsd:0,latencyMs:Date.now()-started,retries:0,discardedReasonCounts:rows?{}:{readFailure:1},
    utilizationEfficiency:rows?.length?1:null,usageBoundary:"api-projection-not-user-read",optimizationOpportunity:"Aggregate all task sources in SQL; reuse existing visible-only refresh interval"}));}
}
