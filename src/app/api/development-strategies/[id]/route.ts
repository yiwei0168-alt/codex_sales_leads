import { requireApiSession } from "@/lib/auth/session";
import { updateDevelopmentDraftVersioned } from "@/lib/outreach/repository";

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
  const expectedRevision=body.expectedRevision;
  if(!Number.isSafeInteger(expectedRevision)||typeof expectedRevision!=="number"||expectedRevision<1)return Response.json({error:"需要当前草稿版本，请刷新后重试"},{status:400});
  if (!draftBody && !approve) return Response.json({ error: "body 或 approve 至少需要一个" }, { status: 400 });
  if (draftBody && (draftBody.length < 40 || draftBody.length > 30_000)) {
    return Response.json({ error: "开发信长度必须在 40–30000 字符之间" }, { status: 400 });
  }
  const updated = await updateDevelopmentDraftVersioned(session.userId, id, { body: draftBody, approve,expectedRevision });
  if(updated.status==="conflict")return Response.json({error:"草稿版本已变化，请刷新后核对"},{status:409});
  return updated.status==="updated"?Response.json({updated:true,status:updated.draftStatus,revision:updated.revision})
    : Response.json({ error: "草稿不存在或状态不可更新" }, { status: 404 });
}
