import { getMissingRagConfig } from "@/lib/rag/config";
import { answerWithRag } from "@/lib/rag/service";
import type { KnowledgeBaseType, RagQuery } from "@/lib/rag/types";
import { requireApiSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const types: KnowledgeBaseType[] = ["industry", "company", "product"];

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const missing = getMissingRagConfig();
  if (missing.length > 0) return Response.json({ error: `RAG 尚未配置：${missing.join(", ")}` }, { status: 503 });

  let input: RagQuery;
  try {
    input = await request.json() as RagQuery;
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const question = input.question?.trim();
  if (!question || question.length < 3 || question.length > 4000) {
    return Response.json({ error: "问题长度必须在 3–4000 字符之间" }, { status: 400 });
  }
  const collections = input.filters?.collections;
  if (collections?.some((type) => !types.includes(type))) {
    return Response.json({ error: "知识库类型无效" }, { status: 400 });
  }

  try {
    const answer = await answerWithRag(session.userId, { ...input, question });
    return Response.json(answer);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "RAG 查询失败" }, { status: 500 });
  }
}
