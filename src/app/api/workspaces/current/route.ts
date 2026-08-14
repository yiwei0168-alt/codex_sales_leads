import { requireApiSession } from "@/lib/auth/session";
import { getCurrentWorkspace, updateWorkspaceMode } from "@/lib/sales/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const workspace = await getCurrentWorkspace();
  return workspace ? Response.json(workspace) : Response.json({ error: "Workspace not found" }, { status: 404 });
}

export async function PATCH(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let body: { mode?: string };
  try { body = await request.json() as { mode?: string }; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (body.mode !== "new-market" && body.mode !== "growth") return Response.json({ error: "Invalid workspace mode" }, { status: 400 });
  await updateWorkspaceMode(body.mode, session.userId);
  return Response.json({ updated: true });
}
