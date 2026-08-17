import { upsertKnowledgeDocument } from "@/lib/rag/repository";
import type { KnowledgeBaseType, KnowledgeDocumentInput } from "@/lib/rag/types";
import { requireApiSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const types: KnowledgeBaseType[] = ["industry", "company", "product"];

function authorized(request: Request): boolean {
  const expected = process.env.KNOWLEDGE_ADMIN_TOKEN;
  if (!expected) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let input: Partial<KnowledgeDocumentInput>;
  try {
    input = await request.json() as Partial<KnowledgeDocumentInput>;
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  if (!input.collection || !types.includes(input.collection) || !input.externalId?.trim() || !input.title?.trim() || !input.content?.trim() || !input.sourceType?.trim()) {
    return Response.json({ error: "collection、externalId、title、content 和 sourceType 为必填字段" }, { status: 400 });
  }
  if (input.content.length > 2_000_000) return Response.json({ error: "单文档上限为 2 MB 文本" }, { status: 413 });

  try {
    const result = await upsertKnowledgeDocument(session.userId, {
      collection: input.collection,
      externalId: input.externalId.trim(),
      title: input.title.trim(),
      content: input.content,
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceType.trim(),
      authorityLevel: input.authorityLevel ?? 3,
      language: input.language ?? "zh-CN",
      market: input.market,
      companyId: input.collection === "company" ? "cudy-technology" : input.companyId,
      productId: input.collection === "product" ? (input.productId ?? input.externalId.trim()) : input.productId,
      capturedAt: input.capturedAt,
      publishedAt: input.publishedAt,
      metadata: input.metadata ?? {},
      visibility: input.visibility === "shared" ? "shared" : "private",
    });
    return Response.json(result, { status: result.skipped ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "文档导入失败" }, { status: 500 });
  }
}
