import { requireApiSession } from "@/lib/auth/session";
import { query } from "@/lib/rag/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceId = "00000000-0000-4000-8000-000000000100";

interface RunRow {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  target_count: number;
  processed_count: number;
  search_credits_used: number;
  extract_credits_used: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ItemRow {
  id: string;
  company_id: string;
  canonical_name: string;
  domain: string;
  status: "pending" | "running" | "completed" | "failed";
  phase: string;
  worker_id: string | null;
  attempts: number;
  named_contact_count: number;
  email_count: number;
  search_credits_used: number;
  extract_credits_used: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const [run] = await query<RunRow>(
      `select id, status, target_count, processed_count, search_credits_used,
       extract_credits_used, error_message, started_at, finished_at
       from company_enrichment_run where workspace_id = $1
       order by started_at desc limit 1`,
      [workspaceId],
    );
    if (!run) return Response.json({ run: null, items: [], counts: { pending: 0, running: 0, completed: 0, failed: 0 } });

    const items = await query<ItemRow>(
      `select i.id, i.company_id, c.canonical_name, c.domain, i.status, i.phase,
       i.worker_id, i.attempts, i.named_contact_count, i.email_count,
       i.search_credits_used, i.extract_credits_used, i.error_message,
       i.started_at, i.finished_at, i.updated_at
       from company_enrichment_run_item i join sales_company c on c.id = i.company_id
       where i.run_id = $1
       order by case i.status when 'running' then 0 when 'failed' then 1 when 'completed' then 2 else 3 end,
         i.updated_at desc`,
      [run.id],
    );
    const counts = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const item of items) counts[item.status] += 1;

    return Response.json({
      run: {
        id: run.id,
        status: run.status,
        targetCount: run.target_count,
        processedCount: run.processed_count,
        searchCreditsUsed: run.search_credits_used,
        extractCreditsUsed: run.extract_credits_used,
        errorMessage: run.error_message,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
      },
      items: items.map((item) => ({
        id: item.id,
        companyId: item.company_id,
        companyName: item.canonical_name,
        domain: item.domain,
        status: item.status,
        phase: item.phase,
        workerId: item.worker_id,
        attempts: item.attempts,
        namedContactCount: item.named_contact_count,
        emailCount: item.email_count,
        searchCreditsUsed: item.search_credits_used,
        extractCreditsUsed: item.extract_credits_used,
        errorMessage: item.error_message,
        startedAt: item.started_at,
        finishedAt: item.finished_at,
        updatedAt: item.updated_at,
      })),
      counts,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取联系人搜索进度" }, { status: 503 });
  }
}
