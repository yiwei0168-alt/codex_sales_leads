import { requireApiSession } from "@/lib/auth/session";
import { getConversation } from "@/lib/assistant/repository";
import {
  claimLeadWorkflowByAction,
  configuredLeadWorkflowMode,
  confirmAndQueueLeadWorkflow,
  executeClaimedLeadWorkflow,
} from "@/lib/leads/workflow/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "动作 ID 无效" }, { status: 400 });
  const mode = configuredLeadWorkflowMode();
  const queued = await confirmAndQueueLeadWorkflow(session.userId, id, mode);
  if (!queued) return Response.json({ error: "搜索计划不存在、正在执行，或已达到最大重试次数" }, { status: 409 });
  if (mode === "worker") {
    return Response.json({
      conversation: await getConversation(session.userId, queued.conversationId),
      workflow: { jobId: queued.jobId, status: "queued", executionMode: mode },
    }, { status: 202 });
  }
  const claimed = await claimLeadWorkflowByAction(session.userId, id, `inline:${process.pid}`);
  if (!claimed) return Response.json({ error: "搜索工作流未能获得执行租约" }, { status: 409 });
  try {
    await executeClaimedLeadWorkflow(claimed);
    return Response.json({ conversation: await getConversation(session.userId, claimed.conversationId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "搜索失败";
    return Response.json({ error: message,
      conversation: await getConversation(session.userId, claimed.conversationId) }, { status: 502 });
  }
}
