import nextEnv from "@next/env";
import { getPool, query } from "../src/lib/rag/db";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const [run] = await query<{
    id: string; mode: string; status: string; target_count: number; processed_count: number; escalated_count: number;
    model_call_count: number; total_tokens: number; routine_model: string; escalation_model: string; started_at: string;
  }>(`select id, mode, status, target_count, processed_count, escalated_count, model_call_count, total_tokens,
            routine_model, escalation_model, started_at
       from contact_verification_run order by started_at desc limit 1`);
  if (!run) throw new Error("No contact verification run found.");
  const categories = await query<{ category: string; count: number; avg_confidence: number; avg_priority: number }>(
    `select category, count(*)::int as count, round(avg(confidence_score))::int as avg_confidence,
            round(avg(development_priority))::int as avg_priority
     from contact_verification_decision where run_id = $1 group by category order by category`,
    [run.id],
  );
  const [review] = await query<{ open_count: number }>(
    `select count(*)::int as open_count from contact_review_queue q
     join contact_verification_decision d on d.id = q.decision_id where d.run_id = $1 and q.status = 'open'`,
    [run.id],
  );
  console.log(JSON.stringify({ run, categories, openReviewCount: review?.open_count ?? 0 }, null, 2));
  if (run.status !== "completed" || run.processed_count !== run.target_count) process.exitCode = 1;
} finally {
  await getPool().end();
}
