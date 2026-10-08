import {requireApiSession} from '@/lib/auth/session';
import {tenantQuery} from '@/lib/rag/db';
import {getMailboxMessageForReview} from '@/lib/mailbox/repository';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const params=new URL(request.url).searchParams;
 const direction=params.get('direction')==='outbound'?'outbound':'inbound';
 const offset=Math.max(0,Math.min(100000,Math.floor(Number(params.get('offset'))||0)));
 const rows=await tenantQuery<{id:string}>(session.userId,"select id from mailbox_message where user_id=$1 and direction=$2 order by sent_at desc nulls last,id limit 21 offset $3",[session.userId,direction,offset]);
 const messages=await Promise.all(rows.slice(0,20).map(item=>getMailboxMessageForReview(session.userId,item.id)));
 return Response.json({messages:messages.filter(Boolean).map(item=>({...item,bodyText:item!.bodyText.slice(0,180)})),hasMore:rows.length>20});
}
