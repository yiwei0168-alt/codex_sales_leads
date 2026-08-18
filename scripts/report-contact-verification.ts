import nextEnv from "@next/env";
import { getPool, query } from "../src/lib/rag/db";
import { resolveTargetWorkspace } from "./resolve-target-workspace";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const workspace = await resolveTargetWorkspace();
  const [run] = await query<{
    id: string; mode: string; status: string; target_count: number; processed_count: number; escalated_count: number;
    model_call_count: number; total_tokens: number; published_count: number; accepted_count: number;
    review_count: number; invalidated_count: number; routine_model: string; escalation_model: string; started_at: string;
  }>(`select id, mode, status, target_count, processed_count, escalated_count, model_call_count, total_tokens,
            published_count, accepted_count, review_count, invalidated_count, routine_model, escalation_model, started_at
       from contact_verification_run where workspace_id = $1 order by started_at desc limit 1`, [workspace.id]);
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
  const [coverage] = await query<{ company_count: number; named_contact_count: number; email_count: number }>(
    `select count(distinct d.company_id)::int as company_count, count(distinct d.contact_id)::int as named_contact_count,
            count(distinct d.email_candidate_id)::int as email_count
     from contact_verification_decision d where d.run_id = $1`,
    [run.id],
  );
  console.log(JSON.stringify({ workspace: { id: workspace.id, email: workspace.email }, run, coverage, categories,
    openReviewCount: review?.open_count ?? 0 }, null, 2));
  if (run.status !== "completed" || run.processed_count !== run.target_count) process.exitCode = 1;
} finally {
  await getPool().end();
}
