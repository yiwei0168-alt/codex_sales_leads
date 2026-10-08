import {requireApiSession} from '@/lib/auth/session';
import {discoverMailboxCustomers,listMailboxCustomers,readCustomerTimeline,editMailboxCustomer,queueTimelineNotes,mergeMailboxCustomers} from '@/lib/mailbox/customer-timeline';
import {tenantQuery} from '@/lib/rag/db';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const search=new URL(request.url).searchParams;const id=search.get('id');const offset=Math.max(0,Math.min(100000,Math.floor(Number(search.get('offset'))||0)));
 if(id){if(!z.uuid().safeParse(id).success)return Response.json({error:'无效公司'},{status:400});const result=await readCustomerTimeline(session.userId,id,offset);return result?Response.json(result):Response.json({error:'公司不存在'},{status:404});}
 return Response.json(await listMailboxCustomers(session.userId,{offset,country:search.get('country')||undefined,archived:search.get('archived')==='true'}));
}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const body=await request.json().catch(()=>null);
 try{
  if(body?.action==='discover')return Response.json(await discoverMailboxCustomers(session.userId,Math.max(0,Math.floor(Number(body.offset)||0))));
  if(body?.action==='save')return Response.json({customer:await editMailboxCustomer(session.userId,body.customer)});
  if(body?.action==='merge'&&z.uuid().safeParse(body.id).success&&z.uuid().safeParse(body.targetId).success)return Response.json(await mergeMailboxCustomers(session.userId,body.id,body.targetId));
  if(body?.action==='summarize'&&z.uuid().safeParse(body.id).success)return Response.json(await queueTimelineNotes(session.userId,body.id),{status:202});
  if(body?.action==='link'&&z.uuid().safeParse(body.id).success&&z.uuid().safeParse(body.messageId).success&&['confirmed','rejected'].includes(body.source)){
   const rows=await tenantQuery(session.userId,`update mailbox_customer_message set source=$4 where user_id=$1 and customer_id=$2 and message_id=$3 returning message_id`,[session.userId,body.id,body.messageId,body.source]);
   return Response.json({updated:rows.length});
  }
  return Response.json({error:'操作无效'},{status:400});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'处理失败'},{status:409});}
}
