import { requireApiSession } from "@/lib/auth/session";
import { runDevelopmentStrategyAgent } from "@/lib/outreach/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed as Record<string, unknown>;
  const companyExternalId = typeof body.companyExternalId === "string" ? body.companyExternalId.trim() : "";
  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : undefined;
  const language = typeof body.language === "string" ? body.language.trim() : "en";
  const tone = typeof body.tone === "string" ? body.tone.trim() : undefined;
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : undefined;
  const targetLength = typeof body.targetLength === "number" ? Math.round(body.targetLength) : undefined;
  if (!companyExternalId || companyExternalId.length > 180) return Response.json({ error: "companyExternalId 无效" }, { status: 400 });
  if (contactId && !/^[0-9a-f-]{36}$/i.test(contactId)) return Response.json({ error: "contactId 无效" }, { status: 400 });
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/i.test(language)) return Response.json({ error: "language 无效" }, { status: 400 });
  if (tone && tone.length > 100) return Response.json({ error: "tone 过长" }, { status: 400 });
  if (instructions && instructions.length > 2_000) return Response.json({ error: "instructions 过长" }, { status: 400 });
  if (targetLength !== undefined && (targetLength < 180 || targetLength > 500)) {
    return Response.json({ error: "targetLength 必须在 180–500 之间" }, { status: 400 });
  }
  try {
    const result = await runDevelopmentStrategyAgent(session.userId, {
      companyExternalId, contactId, language, tone, instructions, targetLength,
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "开发策略生成失败" }, { status: 500 });
  }
}
