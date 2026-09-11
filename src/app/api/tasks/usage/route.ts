import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";

/** New non-lead telemetry only, not the whole product bill. */
export async function GET(){
  const session=await requireApiSession();if(session instanceof Response)return session;
  try{
    const rows=await tenantQuery(session.userId,`select stage,count(*)::int as operations,
      count(*) filter(where status='running')::int as unsettled,
      count(*) filter(where status='failed')::int as failed,
      count(*) filter(where metrics->>'costUsd' is null)::int as unknown_cost_operations,
      sum((metrics->>'costUsd')::numeric) as known_cost_usd,
      sum((metrics->>'inputTokens')::bigint) as reported_input_tokens,
      sum((metrics->>'outputTokens')::bigint) as reported_output_tokens,
      sum((metrics->>'latencyMs')::bigint) as recorded_latency_ms,
      sum((metrics->>'retries')::int) as reported_retries
      from product_operation_metric where user_id=$1 and created_at>=now()-interval '30 days' group by stage order by stage`,[session.userId]);
    return Response.json({scope:"new-non-lead-operations-only",periodDays:30,stages:rows,totalCostComplete:false,notice:"仅统计已接入新用量表的非线索操作；不包含线索搜索、补证或邮件生成账单。未知费用未按零计算。"},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"用量汇总读取失败，不能据此推断费用为零"},{status:503});}
}
