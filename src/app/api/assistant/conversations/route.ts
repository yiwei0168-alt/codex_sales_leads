import { requireApiSession } from "@/lib/auth/session";
import { createConversation, listConversations } from "@/lib/assistant/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  return Response.json({ conversations: await listConversations(session.userId) });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { parsed = {}; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed as { title?: string };
  if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 120)) {
    return Response.json({ error: "对话标题无效" }, { status: 400 });
  }
  return Response.json({ id: await createConversation(session.userId, body.title?.trim() || "新对话") }, { status: 201 });
}
