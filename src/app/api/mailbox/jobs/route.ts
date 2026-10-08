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
 if(body?.action!=='cancel-queued')return Response.json({error:'操作无效'},{status:400});
 const rows=await tenantQuery(session.userId,"update mailbox_work_job set status='cancelled',updated_at=now() where user_id=$1 and status='queued' returning id",[session.userId]);
 return Response.json({cancelled:rows.length});
}
