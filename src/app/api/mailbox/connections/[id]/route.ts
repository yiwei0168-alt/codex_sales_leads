import { requireApiSession } from "@/lib/auth/session";
import { deleteMailboxConnectionData } from "@/lib/mailbox/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "邮箱连接 ID 无效" }, { status: 400 });
  let body: { confirm?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (body.confirm !== "DELETE_MAILBOX_DATA") return Response.json({ error: "缺少删除确认" }, { status: 400 });
  const deleted = await deleteMailboxConnectionData(session.userId, id);
  return deleted ? Response.json({ deleted: true }) : Response.json({ error: "邮箱连接不存在" }, { status: 404 });
}
