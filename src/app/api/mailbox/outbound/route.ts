import { requireApiSession } from "@/lib/auth/session";
import { listOutbound,sendMailSchema,sendOutbound,verifyOutbound } from "@/lib/mailbox/outbound";
export const runtime="nodejs";
export async function GET(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;
  const company=new URL(request.url).searchParams.get("company")??"";
  return Response.json({messages:await listOutbound(session.userId,company)});
}
export async function POST(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;
  const body=await request.json().catch(()=>null);
  if(body?.action==="verify"&&typeof body.connectionId==="string"&&/^[0-9a-f-]{36}$/i.test(body.connectionId)){
    try{await verifyOutbound(session.userId,body.connectionId);return Response.json({verified:true});}
    catch{return Response.json({error:"SMTP连接验证失败，请检查客户端授权与邮箱站点配置"},{status:400});}
  }
  const input=sendMailSchema.safeParse(body);if(!input.success)return Response.json({error:"请确认发件邮箱、单一收件人、主题和正文"},{status:400});
  try{return Response.json(await sendOutbound(session.userId,input.data));}
  catch{return Response.json({error:"发送未完成。请查看发送记录并核实状态，不要直接重复发送。"},{status:400});}
}
