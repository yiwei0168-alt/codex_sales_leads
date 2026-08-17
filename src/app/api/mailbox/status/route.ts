import { requireApiSession } from "@/lib/auth/session";
import { query } from "@/lib/rag/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const [counts, latestRun] = await Promise.all([
    query<{ message_count: number; pending_count: number; policy_count: number; customer_count: number; template_count: number }>(
      `select
         (select count(*)::int from mailbox_message where user_id = $1) as message_count,
         count(*) filter (where review_status = 'pending')::int as pending_count,
         count(*) filter (where kind = 'company-policy')::int as policy_count,
         count(*) filter (where kind = 'customer-signal')::int as customer_count,
         count(*) filter (where kind = 'email-template')::int as template_count
       from mailbox_artifact_candidate where user_id = $1`,
      [session.userId],
    ),
    query<{
      id: string; status: string; phase: string; folder_count: number; imported_count: number;
      skipped_count: number; discovered_count: number; processed_count: number; learning_total: number;
      learning_processed: number; learning_failed: number; candidate_count: number; current_subject: string | null;
      model: string | null; error_message: string | null; started_at: string; updated_at: string; finished_at: string | null;
    }>(
      `select id, status, phase, folder_count, imported_count, skipped_count, discovered_count,
              processed_count, learning_total, learning_processed, learning_failed, candidate_count,
              current_subject, model, error_message, started_at::text, updated_at::text, finished_at::text
       from mailbox_sync_run where user_id = $1 order by started_at desc limit 1`,
      [session.userId],
    ),
  ]);
  const count = counts[0];
  const run = latestRun[0] ?? null;
  const recentMessages = run ? await query<{
    id: string; subject: string; excerpt: string; direction: string; learning_status: string;
    learning_error: string | null; updated_at: string;
  }>(
    `select id, subject, left(body_text, 600) as excerpt, direction, learning_status, learning_error, updated_at::text
     from mailbox_message where user_id = $1 and sync_run_id = $2
     order by updated_at desc limit 16`,
    [session.userId, run.id],
  ) : [];
  return Response.json({
    configured: Boolean(process.env.MAILBOX_CREDENTIAL_KEY?.trim()),
    kimiConfigured: Boolean(process.env.KIMI_API_KEY?.trim()),
    kimiModel: process.env.KIMI_MODEL?.trim() || "kimi-k3",
    messages: count?.message_count ?? 0,
    pendingCandidates: count?.pending_count ?? 0,
    candidates: {
      policies: count?.policy_count ?? 0,
      customers: count?.customer_count ?? 0,
      templates: count?.template_count ?? 0,
    },
    latestRun: run,
    recentMessages,
  });
}
