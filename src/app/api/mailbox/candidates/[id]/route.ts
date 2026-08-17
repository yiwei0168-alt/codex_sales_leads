import { requireApiSession } from "@/lib/auth/session";
import { query } from "@/lib/rag/db";
import { upsertKnowledgeDocument } from "@/lib/rag/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let body: { status?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (body.status !== "approved" && body.status !== "rejected") return Response.json({ error: "status 无效" }, { status: 400 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "候选 ID 无效" }, { status: 400 });
  const rows = await query<{ id: string; kind: string; title: string; content: string; structured_data: Record<string, unknown> }>(
    `select id, kind, title, content, structured_data from mailbox_artifact_candidate
     where id = $1 and user_id = $2 and review_status = 'pending' limit 1`,
    [id, session.userId],
  );
  const candidate = rows[0];
  if (!candidate) return Response.json({ error: "候选不存在" }, { status: 404 });

  if (body.status === "approved") {
    await upsertKnowledgeDocument(session.userId, {
      collection: "company",
      externalId: `mailbox-artifact:${candidate.id}`,
      title: candidate.title,
      content: candidate.content,
      sourceType: "private-mailbox-approved",
      authorityLevel: 4,
      language: "auto",
      companyId: "cudy-technology",
      capturedAt: new Date().toISOString(),
      metadata: { mailboxArtifactKind: candidate.kind, privateToUser: true },
      visibility: "private",
    });
  }
  await query(
    `update mailbox_artifact_candidate set review_status = $3, reviewed_at = now()
     where id = $1 and user_id = $2 and review_status = 'pending'`,
    [id, session.userId, body.status],
  );
  return Response.json({ updated: true, status: body.status });
}
