import { z } from 'zod';
import { requireApiSession } from '@/lib/auth/session';
import { proposeSearchContinuation } from '@/lib/assistant/search-continuation';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;
  if(!z.uuid().safeParse(id).success||!z.object({propose:z.literal(true)}).strict().safeParse(await request.json().catch(()=>null)).success)return Response.json({error:'续搜提案参数无效'},{status:400});
  try{return Response.json(await proposeSearchContinuation(session.userId,id));}
  catch(error){return Response.json({error:error instanceof Error?error.message:'无法创建续搜提案'},{status:409});}
}
