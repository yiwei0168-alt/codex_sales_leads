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
    query<{ id: string; status: string; imported_count: number; skipped_count: number; discovered_count: number; started_at: string; finished_at: string | null }>(
      `select id, status, imported_count, skipped_count, discovered_count, started_at::text, finished_at::text
       from mailbox_sync_run where user_id = $1 order by started_at desc limit 1`,
      [session.userId],
    ),
  ]);
  const count = counts[0];
  return Response.json({
    configured: Boolean(process.env.MAILBOX_CREDENTIAL_KEY?.trim()),
    messages: count?.message_count ?? 0,
    pendingCandidates: count?.pending_count ?? 0,
    candidates: {
      policies: count?.policy_count ?? 0,
      customers: count?.customer_count ?? 0,
      templates: count?.template_count ?? 0,
    },
    latestRun: latestRun[0] ?? null,
  });
}
