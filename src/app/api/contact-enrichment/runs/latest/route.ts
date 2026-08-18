import { requireApiSession } from "@/lib/auth/session";
import { query } from "@/lib/rag/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  workspace_id: string;
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

interface CoverageRow {
  target_count: number;
  covered_count: number;
  contact_count: number;
  email_count: number;
}

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const [run] = await query<RunRow>(
      `select r.id, r.workspace_id, r.status, r.target_count, r.processed_count, r.search_credits_used,
       extract_credits_used, error_message, started_at, finished_at
       from company_enrichment_run r join market_workspace w on w.id = r.workspace_id
       where w.owner_id = $1 and w.slug = 'global-sales'
       order by r.started_at desc limit 1`,
      [session.userId],
    );
    if (!run) return Response.json({ run: null, items: [], counts: { pending: 0, running: 0, completed: 0, failed: 0 }, workspaceCoverage: null });

    const [items, coverageRows] = await Promise.all([query<ItemRow>(
      `select i.id, i.company_id, c.canonical_name, c.domain, i.status, i.phase,
       i.worker_id, i.attempts, i.named_contact_count, i.email_count,
       i.search_credits_used, i.extract_credits_used, i.error_message,
       i.started_at, i.finished_at, i.updated_at
       from company_enrichment_run_item i join sales_company c on c.id = i.company_id
       where i.run_id = $1
       order by case i.status when 'running' then 0 when 'failed' then 1 when 'completed' then 2 else 3 end,
         i.updated_at desc`,
      [run.id],
    ), query<CoverageRow>(
      `with targets as (
         select c.id from workspace_company wc join sales_company c on c.id = wc.company_id
         where wc.workspace_id = $1 and c.source_kind = 'tavily-live'
       )
       select count(*)::int as target_count,
         count(*) filter (where exists (select 1 from company_web_evidence e where e.workspace_id = $1 and e.company_id = t.id))::int as covered_count,
         (select count(*)::int from company_contact ct where ct.workspace_id = $1 and ct.company_id in (select id from targets)) as contact_count,
         (select count(*)::int from company_email_candidate em where em.workspace_id = $1 and em.company_id in (select id from targets) and em.status <> 'Invalid') as email_count
       from targets t`,
      [run.workspace_id],
    )]);
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
      workspaceCoverage: coverageRows[0] ? {
        targetCount: coverageRows[0].target_count,
        coveredCount: coverageRows[0].covered_count,
        contactCount: coverageRows[0].contact_count,
        emailCount: coverageRows[0].email_count,
      } : null,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取联系人搜索进度" }, { status: 503 });
  }
}
