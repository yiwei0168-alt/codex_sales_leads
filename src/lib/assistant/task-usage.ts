import {tenantQuery} from "@/lib/rag/db";
import {WORKFLOW_MODEL_USAGE_SQL,WORKFLOW_STAGE_USAGE_SQL} from "@/lib/billing/workflow-usage-summary";

/** Transport bills and workflow observations overlap; never add their totals. */
export async function readTaskUsage(userId:string){
  const [stages,billingStages,workflowStageMetrics,workflowModelUsage]=await Promise.all([
    tenantQuery(userId,`select stage,count(*)::int as operations,
      count(*) filter(where status='running')::int as unsettled,
      count(*) filter(where status='failed')::int as failed,
      count(*) filter(where metrics->>'costUsd' is null)::int as unknown_cost_operations,
      sum((metrics->>'costUsd')::numeric) as known_cost_usd,
      sum((metrics->>'inputTokens')::bigint) as reported_input_tokens,
      sum((metrics->>'outputTokens')::bigint) as reported_output_tokens,
      sum((metrics->>'latencyMs')::bigint) as recorded_latency_ms,
      sum((metrics->>'retries')::int) as reported_retries
      from product_operation_metric where user_id=$1 and created_at>=now()-interval '30 days' group by stage order by stage`,[userId]),
    tenantQuery(userId,`select stage,count(*)::int as http_attempts,
      sum(reserved_micros)::text as reserved_micros,sum(reported_micros)::text as reported_micros,
      count(*) filter(where reported_micros is null and settled_source is distinct from 'verified-unbilled')::int as unknown_bills,
      count(*) filter(where status='reserved')::int as unsettled_attempts,
      sum((metrics->>'inputTokens')::bigint)::text as input_tokens,
      sum((metrics->>'outputTokens')::bigint)::text as output_tokens,
      sum((metrics->>'latencyMs')::bigint)::text as summed_attempt_latency_ms
      from paid_call_reservation where user_id=$1 and created_at>=now()-interval '30 days' group by stage order by stage`,[userId]),
    tenantQuery(userId,WORKFLOW_STAGE_USAGE_SQL,[userId]),
    tenantQuery(userId,WORKFLOW_MODEL_USAGE_SQL,[userId]),
  ]);
  return {scope:"operations-and-http-attempts-separate",periodDays:30,stages,billingStages,
    workflowStageMetrics,workflowModelUsage,userAdoptionCoverage:"unknown",totalCostComplete:false,
    notice:"操作、HTTP预留、工作流阶段与模型用量是不同且有重叠的记录，金额和数量不得跨表相加。工作流阶段的下游使用不是用户采用；未知采用、费用和历史未接入调用不填零。预留不是实际花费；延迟是记录耗时之和，不是并行任务墙钟时间。"};
}
