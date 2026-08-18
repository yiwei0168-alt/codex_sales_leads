import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const items = await tenantQuery<{
    id: string; message_id: string; kind: string; title: string; content: string;
    confidence: number | null; rationale: string | null; model: string | null; reviewed_at: string;
  }>(session.userId,
    `select id, message_id, kind, title, content, confidence, rationale, model, reviewed_at::text
     from mailbox_artifact_candidate
     where user_id = $1 and review_status = 'approved'
     order by reviewed_at desc nulls last, created_at desc limit 200`,
    [session.userId],
  );
  return Response.json({ items, total: items.length });
}
