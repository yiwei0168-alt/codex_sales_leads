import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { taskFeedSql,type TaskFeedItem } from "@/lib/assistant/task-feed";
const schema=z.object({kind:z.enum(["all","search","contacts","draft","send","relationship"]),country:z.string().regex(/^(all|unknown|[A-Z]{2})$/),status:z.enum(["all","active","attention","finished"]),offset:z.coerce.number().int().min(0).max(100000)});
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  const parsed=schema.safeParse({kind:params.get("kind")??"all",country:params.get("country")??"all",status:params.get("status")??"all",offset:params.get("offset")??0});
  if(!parsed.success)return Response.json({error:"任务筛选参数无效"},{status:400});
  const startedAt=Date.now();
  try{const p=parsed.data;const rows=await tenantQuery<TaskFeedItem>(session.userId,taskFeedSql,[session.userId,p.kind,p.country,p.status,p.offset]);
    console.info(JSON.stringify({event:"workflow-efficiency",stage:"task-feed-read",version:"ui-v1.1-4e",inputItems:rows.length,
      validOutputItems:Math.min(rows.length,50),downstreamUsedItems:Math.min(rows.length,50),usageBoundary:"api-projection",inputTokens:0,outputTokens:0,
      paidApiCostUsd:0,apiCredits:0,databaseCostUsd:null,latencyMs:Date.now()-startedAt,retries:0,
      discardedReasonCounts:rows.length>50?{paginationSentinel:1}:{},utilizationEfficiency:rows.length?Math.min(rows.length,50)/rows.length:null,
      optimizationOpportunity:"Project metadata once; never decrypt mail or regenerate strategy for task lists"}));
    return Response.json({items:rows.slice(0,50),hasMore:rows.length>50},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"任务列表读取失败，请重试"},{status:503});}
}
