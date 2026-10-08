import { requireApiSession } from "@/lib/auth/session";
import { listMailboxLearningQueue } from "@/lib/mailbox/repository";
import {tenantQuery} from '@/lib/rag/db';

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  if(new URL(request.url).searchParams.get('select')==='all')return Response.json({ids:(await tenantQuery<{id:string}>(session.userId,"select id from mailbox_message where user_id=$1 and learning_status in ('pending','failed') and not coalesce((metadata->>'rawContentPurged')::boolean,false) order by id",[session.userId])).map(item=>item.id)});
  const page=Math.max(1,Math.min(100000,Number(new URL(request.url).searchParams.get("page"))||1));
  const pageSize=8;
  return Response.json({...await listMailboxLearningQueue(session.userId,(page-1)*pageSize,pageSize),page,pageSize});
}
