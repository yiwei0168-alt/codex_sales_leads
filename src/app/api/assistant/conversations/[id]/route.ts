import { requireApiSession } from "@/lib/auth/session";
import { deleteConversation, getConversation, updateConversation } from "@/lib/assistant/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!uuid.test(id)) return Response.json({ error: "对话 ID 无效" }, { status: 400 });
  const conversation = await getConversation(session.userId, id);
  return conversation ? Response.json({ conversation }) : Response.json({ error: "对话不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!uuid.test(id)) return Response.json({ error: "对话 ID 无效" }, { status: 400 });
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed as { title?: string; status?: "active" | "archived" };
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.length > 120)) {
    return Response.json({ error: "对话标题无效" }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "active" && body.status !== "archived") return Response.json({ error: "对话状态无效" }, { status: 400 });
  return await updateConversation(session.userId, id, { title: body.title?.trim(), status: body.status })
    ? Response.json({ updated: true }) : Response.json({ error: "对话不存在" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!uuid.test(id)) return Response.json({ error: "对话 ID 无效" }, { status: 400 });
  return await deleteConversation(session.userId, id) ? Response.json({ deleted: true }) : Response.json({ error: "对话不存在" }, { status: 404 });
}
