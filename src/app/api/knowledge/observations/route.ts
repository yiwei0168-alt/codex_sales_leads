import {requireApiSession} from "@/lib/auth/session";
import {memoryAt,memoryConflicts,memoryNotices,memoryTimeline,undoMemory} from "@/lib/knowledge/temporal-memory";
import {correctMemory,memoryCorrectionSchema} from '@/lib/knowledge/memory-correction';

const noStore={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const params=new URL(request.url).searchParams;
  const offset=Number(params.get("offset")??0);
  const view=params.get("view")??"current";
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!["current","timeline","conflicts","notices"].includes(view))
    return Response.json({error:"Invalid memory view"},{status:400});
  try{
    const now=new Date().toISOString();
    const rows=view==="current"?await memoryAt(session.userId,now,now,{},13,offset)
      :view==="timeline"?await memoryTimeline(session.userId,13,offset)
      :view==="conflicts"?await memoryConflicts(session.userId,13,offset)
      :await memoryNotices(session.userId,13,offset);
    return Response.json({items:rows.slice(0,12),hasMore:rows.length>12},{headers:noStore});
  }catch{return Response.json({error:"Memory observations unavailable"},{status:503,headers:noStore});}
}

export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const body=await request.json().catch(()=>null) as {action?:unknown;id?:unknown;content?:unknown;reason?:unknown;businessTime?:unknown}|null;
  if(body?.action==='correct'){
    const parsed=memoryCorrectionSchema.safeParse({id:body.id,content:body.content,reason:body.reason,...(body.businessTime!==undefined?{businessTime:body.businessTime}:{})});
    if(!parsed.success)return Response.json({error:'请核对更正内容（3～800 字）、原因（最多 500 字）和业务时间；结束时间必须晚于开始时间。'},{status:400,headers:noStore});
    try{return Response.json({id:await correctMemory(session.userId,parsed.data)},{headers:noStore});}
    catch(error){
      const message=error instanceof Error?error.message:'';
      const known:Record<string,[number,string]>={
        'Memory target is unavailable':[404,'记忆不存在或不可访问。'],
        'Memory version changed':[409,'这条记忆已被更正或撤销，请刷新后查看最新记录。'],
        'Use original memory editor':[409,'请在原偏好管理入口修改这条记忆。'],
        'Memory correction is unchanged':[400,'更正内容和业务时间均与原记录相同。'],
      };
      const [status,text]=known[message]??[503,'更正未保存，请稍后重试。'];
      return Response.json({error:text},{status,headers:noStore});
    }
  }
  if(body?.action!=="undo"||typeof body.id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
    return Response.json({error:"Invalid memory undo"},{status:400});
  try{const id=await undoMemory(session.userId,body.id);return Response.json({id},{headers:noStore});}
  catch(error){if(error instanceof Error&&error.message==='Memory version changed')return Response.json({error:'这条记忆已被更正，请刷新后查看最新记录。'},{status:409,headers:noStore});
    return Response.json({error:error instanceof Error&&error.message==="Memory target is unavailable"?"Memory unavailable":"Memory undo failed"},
    {status:error instanceof Error&&error.message==="Memory target is unavailable"?404:503,headers:noStore});}
}
