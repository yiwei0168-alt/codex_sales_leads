import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { loadMemory, undoMemory } from "@/lib/assistant/main/memory";
export async function GET() {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  return Response.json({ memories: await loadMemory(session.userId) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PATCH(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const p = z.object({ id: z.uuid(), version: z.number().int().min(1), action: z.literal("undo") }).strict().safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid memory change" }, { status: 400 });
  const changed = await undoMemory(session.userId, p.data.id, p.data.version, session.role);
  return Response.json({ changed }, { status: changed ? 200 : 409 });
}
