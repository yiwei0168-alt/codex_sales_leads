import { requireApiSession } from "@/lib/auth/session";
import { query } from "@/lib/rag/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const rows = await query<{
    id: string; kind: string; title: string; excerpt: string; structured_data: Record<string, unknown>;
    review_status: string; created_at: string; confidence: number | null; rationale: string | null; model: string | null;
  }>(
    `select id, kind, title, left(content, 1200) as excerpt, structured_data,
            review_status, confidence, rationale, model, created_at::text
     from mailbox_artifact_candidate
     where user_id = $1 and review_status = 'pending'
     order by created_at desc limit 50`,
    [session.userId],
  );
  return Response.json({ candidates: rows });
}
