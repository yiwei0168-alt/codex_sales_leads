import { requireApiSession } from "@/lib/auth/session";
import { deleteMailboxConnectionData,disconnectMailbox } from "@/lib/mailbox/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:"邮箱连接 ID 无效"},{status:400});
  const body=await request.json().catch(()=>null);if(body?.action!=="disconnect")return Response.json({error:"操作无效"},{status:400});
  try{return await disconnectMailbox(session.userId,id)?Response.json({disconnected:true}):Response.json({error:"邮箱连接不存在"},{status:404});}
  catch{return Response.json({error:"请等待正在进行的同步完成后重试"},{status:409});}
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "邮箱连接 ID 无效" }, { status: 400 });
  let body: { confirm?: string;deleteKnowledge?:boolean };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  if (body.confirm !== "DELETE_MAILBOX_DATA") return Response.json({ error: "缺少删除确认" }, { status: 400 });
  let deleted:boolean;
  try{deleted=await deleteMailboxConnectionData(session.userId,id,body.deleteKnowledge===true);}
  catch{return Response.json({error:"请等待同步结束后再删除；数据未更改"},{status:409});}
  return deleted ? Response.json({ deleted: true }) : Response.json({ error: "邮箱连接不存在" }, { status: 404 });
}
