/** Read-only aggregates. Stage counts and model usage are overlapping observations, never additive bills. */
export const WORKFLOW_STAGE_USAGE_SQL=`select stage,count(*)::int as stage_records,
      sum(input_items)::text as input_items,sum(output_items)::text as output_items,
      sum(generated_artifacts)::text as generated_artifacts,
      sum(valid_artifacts)::text as valid_artifacts,
      sum(downstream_used_artifacts)::text as downstream_used_artifacts,
      sum(paid_search_credits)::text as recorded_search_credits,
      sum(extract(epoch from completed_at-started_at)*1000)::text as recorded_stage_latency_ms,
      count(*) filter(where downstream_used_artifacts>generated_artifacts
        or downstream_used_artifacts>valid_artifacts
        or valid_artifacts>generated_artifacts)::int as invalid_count_records,
      case when sum(generated_artifacts)>0 and
        bool_and(downstream_used_artifacts<=valid_artifacts
          and valid_artifacts<=generated_artifacts)
        then (sum(downstream_used_artifacts)::numeric/sum(generated_artifacts))::text
        else null end as downstream_utilization
      from workflow_stage_metric where user_id=$1 and created_at>=now()-interval '30 days'
      group by stage order by stage`;

export const WORKFLOW_MODEL_USAGE_SQL=`select stage,count(*)::int as model_attempt_records,
      sum(prompt_tokens)::text as recorded_prompt_tokens,
      sum(completion_tokens)::text as recorded_completion_tokens,
      sum(reasoning_tokens)::text as recorded_reasoning_tokens,
      sum(total_tokens)::text as recorded_total_tokens,
      sum(latency_ms)::text as recorded_model_latency_ms,
      count(*) filter(where fallback_used)::int as fallback_records
      from workflow_model_usage where user_id=$1 and created_at>=now()-interval '30 days'
      group by stage order by stage`;
