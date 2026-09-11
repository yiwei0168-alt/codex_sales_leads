import { requireApiSession } from "@/lib/auth/session";
import { listMemories,changeMemory,memoryChangeSchema } from "@/lib/outreach/memory-management";
import { memoryEditorSchema } from "@/lib/outreach/memory-editor";
import { saveManualMemory } from "@/lib/outreach/memory-save";
export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=memoryEditorSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({error:"请检查内容、范围和确认选项"},{status:400});
  try{const status=await saveManualMemory(session.userId,input.data);
    if(status!=="ok")return Response.json({error:status==="not-found"?"记忆不存在":"版本已变化、记录已存在或需在源页面编辑，请刷新核实"},{status:status==="not-found"?404:409});
    return Response.json({ok:true});
  }catch{return Response.json({error:"保存未确认，请刷新核实；不会使用新正文配旧向量"},{status:503});}
}
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const offset=Number(new URL(request.url).searchParams.get("offset")??0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return Response.json({error:"分页参数无效"},{status:400});
  try {const rows=await listMemories(session.userId,offset);return Response.json({items:rows.slice(0,50),hasMore:rows.length>50},{headers:{"Cache-Control":"private, no-store"}});}
  catch{return Response.json({error:"个人记忆读取失败"},{status:503});}
}
export async function PATCH(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=memoryChangeSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({error:"请确认有效的记忆操作"},{status:400});
  try {const status=await changeMemory(session.userId,input.data);
    if(status==="not-found")return Response.json({error:"记忆不存在"},{status:404});
    if(status==="source-managed")return Response.json({error:"请在公司详情或渠道关系图修改此事实记录"},{status:409});
    return Response.json({ok:true});
  }catch{return Response.json({error:"操作失败，请刷新核实状态"},{status:503});}
}
