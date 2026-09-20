import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { controlRun } from "@/lib/assistant/main/repository";
const input = z.object({ action: z.enum(["pause", "resume", "cancel", "instruct"]), content: z.string().trim().min(1).max(100_000).optional() }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const { id } = await context.params;
  const p = input.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !p.success) return Response.json({ error: "Invalid control" }, { status: 400 });
  try {
    const found = await controlRun(session.userId, id, p.data.action, p.data.content);
    return found ? Response.json({ accepted: true }) : Response.json({ error: "Not found" }, { status: 404 });
  } catch { return Response.json({ error: "当前状态不能执行此操作" }, { status: 409 }); }
}
