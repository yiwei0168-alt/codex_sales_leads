import { requireApiSession } from "@/lib/auth/session";
import { readLatestEnrichmentRun } from "@/lib/contacts/enrichment-run-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  try {
    return Response.json(await readLatestEnrichmentRun(session.userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取联系人搜索进度" }, { status: 503 });
  }
}
