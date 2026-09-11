import { z } from 'zod';
import { requireApiSession } from '@/lib/auth/session';
import { reconcileContactLookup } from '@/lib/contacts/reconcile-lookup';
import { reconcileRelationshipAnalysis } from '@/lib/sales/reconcile-relationship';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const {id}=await params;
  const input=z.object({kind:z.enum(['contacts','relationship']),confirmed:z.literal(true)}).strict().safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!input.success)return Response.json({error:'请明确确认结束本地异常查询，外部调用费用不会自动退还'},{status:400});
  try{return Response.json(input.data.kind==='contacts'?await reconcileContactLookup(session.userId,id):await reconcileRelationshipAnalysis(session.userId,id));}
  catch{return Response.json({error:'此查询不可核实结束，可能正在完成或已更新，请刷新任务记录'},{status:409});}
}
