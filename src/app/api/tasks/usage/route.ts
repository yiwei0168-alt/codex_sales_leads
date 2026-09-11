import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";

/** Operational output efficiency and transport billing are distinct, overlapping ledgers. */
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
    const billing=await tenantQuery(session.userId,`select stage,count(*)::int as http_attempts,
      sum(reserved_micros)::text as reserved_micros,sum(reported_micros)::text as reported_micros,
      count(*) filter(where reported_micros is null)::int as unknown_bills,
      count(*) filter(where status='reserved')::int as unsettled_attempts,
      sum((metrics->>'inputTokens')::bigint)::text as input_tokens,
      sum((metrics->>'outputTokens')::bigint)::text as output_tokens,
      sum((metrics->>'latencyMs')::bigint)::text as summed_attempt_latency_ms
      from paid_call_reservation where user_id=$1 and created_at>=now()-interval '30 days' group by stage order by stage`,[session.userId]);
    return Response.json({scope:"operations-and-http-attempts-separate",periodDays:30,stages:rows,billingStages:billing,totalCostComplete:false,
      notice:"操作表包含已接入的意图、生成及预算拒绝等记录；HTTP表包含已受控的线索与非线索付费尝试。两表有重叠，不得相加。预留不是实际花费，未知账单不是零；延迟是各次耗时之和，不是并行任务墙钟时间。历史未接入调用不追算。"},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"用量汇总读取失败，不能据此推断费用为零"},{status:503});}
}
