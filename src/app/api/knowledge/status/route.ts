import { getMissingRagConfig } from "@/lib/rag/config";
import { getKnowledgeStats } from "@/lib/rag/repository";
import type { KnowledgeBaseType, KnowledgeStats } from "@/lib/rag/types";
import { requireApiSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emptyCollections: KnowledgeStats["collections"] = (["industry", "company", "product"] as KnowledgeBaseType[]).map((type) => ({
  type, documentCount: 0, chunkCount: 0, embeddedCount: 0,
}));

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const missing = getMissingRagConfig();
  if (missing.includes("DATABASE_URL")) {
    return Response.json({
      configured: false,
      provider: "PostgreSQL + pgvector",
      collections: emptyCollections,
      error: `缺少配置：${missing.join(", ")}`,
    } satisfies KnowledgeStats);
  }

  try {
    const stats = await getKnowledgeStats(session.userId);
    if (missing.length > 0) {
      stats.configured = false;
      stats.error = `数据库已连接，但缺少：${missing.join(", ")}`;
    }
    return Response.json(stats);
  } catch (error) {
    return Response.json({
      configured: false,
      provider: "PostgreSQL + pgvector",
      collections: emptyCollections,
      error: error instanceof Error ? error.message : "知识库连接失败",
    } satisfies KnowledgeStats, { status: 503 });
  }
}
