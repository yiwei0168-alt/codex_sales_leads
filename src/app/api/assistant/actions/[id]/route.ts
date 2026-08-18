import { requireApiSession } from "@/lib/auth/session";
import { getAssistantAction } from "@/lib/assistant/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "动作 ID 无效" }, { status: 400 });
  const action = await getAssistantAction(session.userId, id);
  return action ? Response.json({ action }) : Response.json({ error: "动作不存在" }, { status: 404 });
}
