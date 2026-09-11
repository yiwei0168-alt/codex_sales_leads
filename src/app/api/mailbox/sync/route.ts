import { requireApiSession } from "@/lib/auth/session";
import { syncAliMail } from "@/lib/mailbox/service";
import { mailboxSyncSchema } from "@/lib/mailbox/sync-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const parsed=mailboxSyncSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"邮箱、日期范围或同步数量无效"},{status:400});const body=parsed.data;
  try {
    const result = await syncAliMail(session.userId, body.connectionId, {
      lookbackDays: body.lookbackDays,
      maxMessages: body.maxMessages,
      folderScope:body.folderScope,from:body.from,through:body.through,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "邮箱同步失败" }, { status: 502 });
  }
}
