import { requireApiSession } from "@/lib/auth/session";
import { runDevelopmentFeedbackAgent } from "@/lib/outreach/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "草稿 ID 无效" }, { status: 400 });
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const feedback = typeof (parsed as Record<string, unknown>).feedback === "string"
    ? String((parsed as Record<string, unknown>).feedback).trim() : "";
  const currentBody = typeof (parsed as Record<string, unknown>).currentBody === "string"
    ? String((parsed as Record<string, unknown>).currentBody).trim() : "";
  const sourceRevision = Number((parsed as Record<string, unknown>).sourceRevision);
  const allowMemory = (parsed as Record<string, unknown>).allowMemory === true;
  if (feedback.length < 3 || feedback.length > 4_000) {
    return Response.json({ error: "反馈长度必须在 3–4000 字符之间" }, { status: 400 });
  }
  if (currentBody.length < 40 || currentBody.length > 30_000) {
    return Response.json({ error: "当前开发信长度必须在 40–30000 字符之间" }, { status: 400 });
  }
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
    return Response.json({ error: "sourceRevision 无效" }, { status: 400 });
  }
  try {
    const result = await runDevelopmentFeedbackAgent(session.userId, {
      draftId: id, feedback, currentBody, sourceRevision, allowMemory,
    });
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "反馈修改失败";
    const status = /新版本|其他操作更新|状态已变化/.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
