import {requireApiSession} from "@/lib/auth/session";
import {memoryAt,memoryConflicts,memoryNotices,memoryTimeline,undoMemory} from "@/lib/knowledge/temporal-memory";

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
  const body=await request.json().catch(()=>null) as {action?:unknown;id?:unknown}|null;
  if(body?.action!=="undo"||typeof body.id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
    return Response.json({error:"Invalid memory undo"},{status:400});
  try{const id=await undoMemory(session.userId,body.id);return Response.json({id},{headers:noStore});}
  catch(error){return Response.json({error:error instanceof Error&&error.message==="Memory target is unavailable"?"Memory unavailable":"Memory undo failed"},
    {status:error instanceof Error&&error.message==="Memory target is unavailable"?404:503,headers:noStore});}
}
