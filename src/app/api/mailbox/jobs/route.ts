import { requireApiSession } from "@/lib/auth/session";
import { mailboxJobs } from "@/lib/mailbox/work-queue";
import { tenantQuery } from "@/lib/rag/db";
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const counts=await tenantQuery(session.userId,"select status,count(*)::int as count from mailbox_work_job where user_id=$1 group by status",[session.userId]);
 return Response.json({jobs:await mailboxJobs(session.userId),counts});
}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 const body=await request.json().catch(()=>null);
 if(body?.action==='reconcile'&&typeof body.id==='string'&&/^[0-9a-f-]{36}$/i.test(body.id)){
  const rows=await tenantQuery(session.userId,`update mailbox_work_job j set status='completed',error=null,updated_at=now()
   where j.user_id=$1 and j.id=$2 and j.status='uncertain' and j.kind='learn'
   and exists(select 1 from mailbox_message m where m.user_id=j.user_id and m.id=j.target_id and m.learning_status='completed' and m.content_sha256=j.payload->>'contentSha256')
   and exists(select 1 from mailbox_outbound_audit a where a.user_id=j.user_id and a.message_id=j.target_id and a.status='completed' and a.created_at>=j.created_at)
   returning j.id`,[session.userId,body.id]);
  return Response.json({reconciled:rows.length,message:rows.length?'原完成收据已核实':'没有完整成功收据，继续保留待核实，不重复外发'});
 }
 if(body?.action!=='cancel-queued')return Response.json({error:'操作无效'},{status:400});
 const rows=await tenantQuery(session.userId,"update mailbox_work_job set status='cancelled',updated_at=now() where user_id=$1 and status='queued' returning id",[session.userId]);
 return Response.json({cancelled:rows.length});
}
