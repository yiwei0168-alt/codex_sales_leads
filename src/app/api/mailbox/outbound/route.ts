import { requireApiSession } from "@/lib/auth/session";
import { listOutbound,sendMailSchema,sendOutbound,verifyOutbound,reconcileMailSchema,reconcileOutbound } from "@/lib/mailbox/outbound";
import { assignMailMarket,assignMailMarketSchema } from "@/lib/mailbox/outbound";
export const runtime="nodejs";
export async function PATCH(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;
  const parsed=reconcileMailSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"请确认外部邮箱记录和实际发送时间"},{status:400});
  try{return Response.json(await reconcileOutbound(session.userId,parsed.data));}catch{return Response.json({error:"此记录不可核实，可能已被其他操作更新；请刷新后检查"},{status:409});}
}
export async function GET(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;const company=params.get("company")??"";const offset=Number(params.get("offset")??0);
  if(!company||company.length>180||!Number.isSafeInteger(offset)||offset<0||offset>1000000)return Response.json({error:"邮件历史参数无效"},{status:400});
  const rows=await listOutbound(session.userId,company,offset,51);
  return Response.json({messages:rows.slice(0,50),hasMore:rows.length>50},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){const session=await requireApiSession();if(session instanceof Response)return session;
  const body=await request.json().catch(()=>null);
  if(body?.action==='assign-market'){
    const input=assignMailMarketSchema.safeParse(body);if(!input.success)return Response.json({error:'请确认历史邮件所属国家'},{status:400});
    try{return Response.json(await assignMailMarket(session.userId,input.data));}catch{return Response.json({error:'国家归属确认失败，记录可能已更新，请刷新重试'},{status:409});}
  }
  if(body?.action==="verify"&&typeof body.connectionId==="string"&&/^[0-9a-f-]{36}$/i.test(body.connectionId)){
    try{await verifyOutbound(session.userId,body.connectionId);return Response.json({verified:true});}
    catch{return Response.json({error:"SMTP连接验证失败，请检查客户端授权与邮箱站点配置"},{status:400});}
  }
  const input=sendMailSchema.safeParse(body);if(!input.success)return Response.json({error:"请确认发件邮箱、单一收件人、主题和正文"},{status:400});
  try{return Response.json(await sendOutbound(session.userId,input.data));}
  catch{return Response.json({error:"发送未完成。请查看发送记录并核实状态，不要直接重复发送。"},{status:400});}
}
