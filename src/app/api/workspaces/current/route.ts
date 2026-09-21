import { requireApiSession } from "@/lib/auth/session";
import { getCurrentWorkspace } from "@/lib/sales/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const workspace = await getCurrentWorkspace(session.userId);
  return workspace ? Response.json(workspace) : Response.json({ error: "Workspace not found" }, { status: 404 });
}

export async function PATCH() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  return Response.json({ code: "capability_removed", error: "全局市场模式能力已移除；请在具体任务中描述业务目标。" }, { status: 410 });
}
