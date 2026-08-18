import { requireApiSession } from "@/lib/auth/session";
import { appendMessage, claimLeadSearchAction, getConversation, setAssistantActionStatus } from "@/lib/assistant/repository";
import { executeGlobalLeadSearch } from "@/lib/leads/global-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "动作 ID 无效" }, { status: 400 });
  const claimed = await claimLeadSearchAction(session.userId, id);
  if (!claimed) return Response.json({ error: "搜索计划不存在、已执行或正在执行" }, { status: 409 });
  try {
    const result = await executeGlobalLeadSearch(session.userId, id, claimed.payload);
    await setAssistantActionStatus(session.userId, id, "completed", { result });
    await appendMessage(session.userId, claimed.conversationId, {
      role: "assistant", intent: "lead-search",
      content: `${result.countryName} 搜索完成：请求 ${result.requested} 家，筛选并保存 ${result.accepted} 家，使用 ${result.creditsUsed} 个 Tavily credits。结果已进入该国家分区，仍需人工复核企业身份与渠道角色。`,
      metadata: { searchResult: result },
    });
    return Response.json({ conversation: await getConversation(session.userId, claimed.conversationId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "搜索失败";
    await setAssistantActionStatus(session.userId, id, "failed", { error: message });
    await appendMessage(session.userId, claimed.conversationId, {
      role: "assistant", intent: "lead-search", content: `搜索未完成：${message}。没有使用模拟公司替代真实结果。`,
    });
    return Response.json({ error: message }, { status: 502 });
  }
}
