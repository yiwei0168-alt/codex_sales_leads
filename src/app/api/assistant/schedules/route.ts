import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { createSchedule, listSchedules, changeSchedule, scheduleInputSchema } from "@/lib/assistant/main/schedules";
export async function GET() {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  return Response.json({ schedules: await listSchedules(session.userId) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const p = scheduleInputSchema.safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ error: "定时任务参数无效" }, { status: 400 });
  try { return Response.json(await createSchedule(session.userId, p.data)); }
  catch { return Response.json({ error: "任务时间必须在未来，且时区有效" }, { status: 400 }); }
}
export async function PATCH(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const p = z.object({ id: z.uuid(), version: z.number().int().min(1), enabled: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ error: "参数无效" }, { status: 400 });
  const changed = await changeSchedule(session.userId, p.data.id, p.data.version, p.data.enabled);
  return Response.json({ changed }, { status: changed ? 200 : 409 });
}
