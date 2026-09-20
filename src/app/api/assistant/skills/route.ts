import { requireApiSession } from "@/lib/auth/session";
import { skillImportSchema, importSkill, listSkills, changeSkill } from "@/lib/assistant/main/skills";
import {loadSkillSource,skillSourceSchema} from "@/lib/assistant/main/skill-sources";
import { z } from "zod";
export async function GET() {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  return Response.json({ skills: await listSkills(session.userId) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PATCH(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const p = z.object({ id: z.uuid(), version: z.number().int().min(1), operation: z.enum(["enable", "disable", "rollback"]) }).strict().safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Skill 操作参数无效" }, { status: 400 });
  try { return Response.json(await changeSkill(session, p.data)); }
  catch { return Response.json({ error: "Skill 已变化或不属于当前账户" }, { status: 409 }); }
}
export async function POST(request: Request) {
  const session = await requireApiSession(); if (session instanceof Response) return session;
  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && "kind" in body) {
    const source = skillSourceSchema.safeParse(body);
    if (!source.success) return Response.json({ error: "Skill 来源参数无效" }, { status: 400 });
    let loaded;
    try { loaded = await loadSkillSource(source.data); }
    catch { return Response.json({ error: "公开 Skill 来源不可用或内容不安全" }, { status: 422 }); }
    try { return Response.json(await importSkill(session, loaded)); }
    catch { return Response.json({ error: "Skill 版本已变化或无法保存" }, { status: 409 }); }
  }
  const p = skillImportSchema.safeParse(body);
  if (!p.success) return Response.json({ error: "Skill 包必须包含 SKILL.md，文件路径和大小须有效" }, { status: 400 });
  try { return Response.json(await importSkill(session, p.data)); }
  catch { return Response.json({ error: "Skill 版本已变化或无法保存" }, { status: 409 }); }
}
