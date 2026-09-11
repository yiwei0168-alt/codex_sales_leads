import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import type { AssistantActionDto } from "@/lib/assistant/types";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return Response.json({ error: "分页参数无效" }, { status: 400 });
  try {
    const rows = await tenantQuery<AssistantActionDto>(session.userId,
      `select id, action_type as "actionType", status, payload,
        jsonb_build_object('discovered',result->'discovered','assessed',result->'assessed',
          'qualified',result->'qualified','accepted',result->'accepted','creditsUsed',result->'creditsUsed') as result,
        created_at::text as "createdAt", updated_at::text as "updatedAt"
       from assistant_action where user_id=$1 order by created_at desc,id desc limit 51 offset $2`, [session.userId, offset]);
    console.info(JSON.stringify({ event: "workflow-efficiency", stage: "task-list-read", version: "ui-v1.1-4a",
      inputItems: rows.length, validOutputItems: Math.min(rows.length,50), downstreamUsedItems: Math.min(rows.length,50),
      usageBoundary: "api-response-projection-not-user-reading", inputTokens: 0, outputTokens: 0, apiCredits: 0,
      paidApiCostUsd: 0, databaseCostUsd: null, latencyMs: Date.now()-startedAt, retries: 0,
      discardedReasonCounts: rows.length>50?{paginationSentinel:1}:{}, utilizationEfficiency: rows.length?Math.min(rows.length,50)/rows.length:null,
      optimizationOpportunity: "Use cursor pagination and server-side filters as history grows" }));
    return Response.json({ actions: rows.slice(0,50), hasMore: rows.length > 50 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "任务列表暂时不可用，请重试" }, { status: 503 }); }
}
