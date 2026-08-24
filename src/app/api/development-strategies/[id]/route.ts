import { requireApiSession } from "@/lib/auth/session";
import { updateDevelopmentDraft } from "@/lib/outreach/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "草稿 ID 无效" }, { status: 400 });
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed as Record<string, unknown>;
  const draftBody = typeof body.body === "string" ? body.body.trim() : undefined;
  const approve = body.approve === true;
  if (!draftBody && !approve) return Response.json({ error: "body 或 approve 至少需要一个" }, { status: 400 });
  if (draftBody && (draftBody.length < 40 || draftBody.length > 20_000)) {
    return Response.json({ error: "开发信长度必须在 40–20000 字符之间" }, { status: 400 });
  }
  const updated = await updateDevelopmentDraft(session.userId, id, { body: draftBody, approve });
  return updated ? Response.json({ updated: true, status: approve ? "approved" : "generated" })
    : Response.json({ error: "草稿不存在或状态不可更新" }, { status: 404 });
}
