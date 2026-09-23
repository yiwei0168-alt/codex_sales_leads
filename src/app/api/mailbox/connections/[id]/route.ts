import { requireApiSession } from "@/lib/auth/session";
import { deleteMailboxConnectionData,disconnectMailbox,updateMailboxConnectionSettings } from "@/lib/mailbox/repository";
import { verifyMailboxSendCapability } from "@/lib/mailbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:"邮箱连接 ID 无效"},{status:400});
  const body=await request.json().catch(()=>null);
  if(body?.action==="settings"){
    const name=typeof body.displayName==="string"?body.displayName.trim():"";
    if(name.length<1||name.length>80||!["read-only","send-enabled"].includes(body.accessMode))return Response.json({error:"名称或收发权限无效"},{status:400});
    if(body.accessMode==="send-enabled")try{await verifyMailboxSendCapability(session.userId,id);}catch(error){const message=error instanceof Error&&/^(此邮箱没有 SMTP 配置|邮箱连接不存在)/.test(error.message)?error.message:"SMTP 验证失败，请检查服务器、客户端专用密码或管理员限制";return Response.json({error:message},{status:502});}
    const updated=await updateMailboxConnectionSettings(session.userId,id,name,body.accessMode);
    return updated?Response.json({updated:true}):Response.json({error:"邮箱未连接，或尚未通过 SMTP 验证；请重新连接并选择可发信"},{status:409});
  }
  if(body?.action!=="disconnect")return Response.json({error:"操作无效"},{status:400});
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
