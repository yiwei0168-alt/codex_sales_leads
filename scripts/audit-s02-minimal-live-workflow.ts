import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { tenantQuery, getPool } = await import("../src/lib/rag/db");
const userId = "cbee9803-3c43-4609-9228-66086b207012";
const actionId = "b3d7fa08-3b37-40b1-a505-158da92a89a0";

try {
  const [job] = await tenantQuery<{status:string;phase:string;graph_thread_id:string;error_message:string|null;started_at:Date;finished_at:Date|null}>(userId,
    "select status,phase,graph_thread_id,error_message,started_at,finished_at from lead_workflow_job where user_id=$1 and action_id=$2",[userId,actionId]);
  if (!job) throw new Error("Isolated S02 job missing");
  const [reservations, stages, runs, models, assessments, checkpoints, reviewCheckpoints, budget] = await Promise.all([
    tenantQuery(userId,`select stage,tariff_key,tariff_version,status,reserved_micros::text,reported_micros::text,settled_micros::text,
      metrics->>'validOutputItems' as valid_items,metrics->>'downstreamUsedItems' as used_items,
      metrics->>'latencyMs' as latency_ms,metrics->>'outputIncomplete' as incomplete,
      metrics->>'inputTokens' as input_tokens,metrics->>'outputTokens' as output_tokens,
      metrics->'providerUsage'->>'apiCredits' as provider_api_credits,
      metrics->'modelAttempt'->>'task' as model_task,
      metrics->'admissionOverride' as admission_override,
      left(request_fingerprint,12) as fingerprint_prefix,
      created_at from paid_call_reservation where user_id=$1 and operation_id=$2 order by created_at`,[userId,actionId]),
    tenantQuery(userId,`select stage,status,input_items,output_items,valid_artifacts,downstream_used_artifacts,
      paid_search_credits,extract(epoch from completed_at-started_at)*1000 as latency_ms,
      metadata->'discardedReasonCounts' as discard_reasons from workflow_stage_metric
      where user_id=$1 and action_id=$2 order by started_at`,[userId,actionId]),
    tenantQuery(userId,`select id,status,workflow_phase,target_count,query_count,raw_result_count,
      unique_candidate_count,accepted_count,credits_used,
      metadata->>'targetCompletionReason' as stop_reason from lead_search_run
      where graph_thread_id=$1 order by started_at`,[job.graph_thread_id]),
    tenantQuery(userId,`select stage,requested_model,actual_model,provider_id,prompt_tokens,
      completion_tokens,total_tokens,latency_ms from workflow_model_usage
      where user_id=$1 and action_id=$2 order by created_at`,[userId,actionId]),
    tenantQuery(userId,`select count(*)::int as total,count(*) filter(where eligible)::int as eligible,
      count(*) filter(where selected)::int as selected from lead_candidate_assessment
      where user_id=$1 and run_id in (select id from lead_search_run where graph_thread_id=$2)`,[userId,job.graph_thread_id]),
    tenantQuery(userId,`select
      (select count(*)::int from lead_qualification_phase_checkpoint where user_id=$1 and action_id=$2) as fact_phases,
      (select count(*)::int from lead_qualification_final_checkpoint where user_id=$1 and action_id=$2) as final_scores,
      (select count(*)::int from langgraph.checkpoints where thread_id=$3) as graph_snapshots`,
      [userId,actionId,job.graph_thread_id]),
    tenantQuery(userId,`select phase,count(*)::int as completed from lead_review_checkpoint
      where user_id=$1 and country_code='CO' group by phase order by phase`,[userId]),
    tenantQuery(userId,`select limit_micros::text,occupied_micros::text,
      greatest(0,limit_micros-occupied_micros)::text as remaining_micros,frozen
      from user_spend_budget where user_id=$1`,[userId]),
  ]);
  const a29Reservations=reservations.filter((row:{admission_override?:{ruleId?:string}|null})=>row.admission_override?.ruleId==="A29");
  console.log(JSON.stringify({actionId,job,budget:budget[0]??null,a29Reservations,reservations,stages,runs,models,assessments,checkpoints,reviewCheckpoints},null,2));
} finally {
  await getPool().end();
}
