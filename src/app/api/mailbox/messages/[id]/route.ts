import { requireApiSession } from "@/lib/auth/session";
import { getMailboxMessageForReview } from "@/lib/mailbox/repository";
import { messageCompanyLink,setMessageCompany } from "@/lib/mailbox/company-links";
import { tenantQuery } from "@/lib/rag/db";
import { z } from "zod";
import { uiEfficiency } from "@/lib/ui-efficiency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "邮件 ID 无效" }, { status: 400 });
  const message = await getMailboxMessageForReview(session.userId, id);
  if (!message) return Response.json({ error: "邮件不存在" }, { status: 404 });
  return Response.json({ message,companyLink:await messageCompanyLink(session.userId,id) },{headers:{"Cache-Control":"private, no-store"}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;const {id}=await params;
  const parsed=z.object({companyId:z.string().min(1).max(180).nullable(),confirmed:z.literal(true)}).strict().safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!parsed.success)return Response.json({error:"公司关联参数无效"},{status:400});
  const started=Date.now();try{const saved=await setMessageCompany(session.userId,id,parsed.data.companyId);uiEfficiency("mail-company-link",started,1,saved?1:0);return saved?Response.json({updated:true}):Response.json({error:"邮件不存在"},{status:404});}catch{return Response.json({error:"无法关联此公司"},{status:400});}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;const {id}=await params;const body=await request.json().catch(()=>null);
  if(!z.uuid().safeParse(id).success||body?.confirmed!==true)return Response.json({error:"缺少删除确认"},{status:400});
  const started=Date.now();const rows=await tenantQuery(session.userId,"delete from mailbox_message where user_id=$1 and id=$2 and learning_status<>'analyzing' returning id",[session.userId,id]);
  uiEfficiency("local-mail-delete",started,1,rows.length);return rows.length?Response.json({deleted:true}):Response.json({error:"邮件不存在或正在学习中"},{status:409});
}
