import { upsertKnowledgeDocument,KnowledgeConflictError } from "@/lib/rag/repository";
import { tenantQuery } from "@/lib/rag/db";
import { sha256 } from "@/lib/rag/chunker";
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
  let input: Partial<KnowledgeDocumentInput>&{expectedContentHash?:string};
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
    const visibility = input.visibility === "shared" ? "shared" : "private";
    if (visibility === "shared" && session.role !== "admin") {
      return Response.json({ error: "只有管理员可以写入共享知识库" }, { status: 403 });
    }
    const previous=await tenantQuery<{content_sha256:string}>(session.userId,`select d.content_sha256 from knowledge_document d join knowledge_collection c on c.id=d.collection_id where d.owner_id=$1 and c.slug=$2 and d.external_id=$3`,[session.userId,input.collection,input.externalId.trim()]);
    const expectedHash=previous[0]?.content_sha256??null;
    if(expectedHash&&expectedHash!==sha256(input.content)&&input.expectedContentHash!==expectedHash)return Response.json({error:"同名知识已有不同内容，请审核后确认覆盖",conflict:true,expectedContentHash:expectedHash},{status:409});
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
      visibility,
    }, session.role,expectedHash);
    return Response.json(result, { status: result.skipped ? 200 : 201 });
  } catch (error) {
    if(error instanceof KnowledgeConflictError)return Response.json({error:error.message,conflict:true},{status:409});
    return Response.json({ error: error instanceof Error ? error.message : "文档导入失败" }, { status: 500 });
  }
}
