import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { encryptMailboxContent,decryptMailboxContent } from "@/lib/mailbox/crypto";
import { followUpContext } from "@/lib/outreach/follow-up-context";
import { generateFollowUp } from "@/lib/outreach/kimi-agent";
import {withProductSpend} from "@/lib/billing/context";
import {BudgetDeniedError} from "@/lib/billing/policy";
const schema=z.object({parentId:z.uuid(),instructions:z.string().trim().min(2).max(2000)}).strict();
export async function GET(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const parentId=new URL(request.url).searchParams.get("parentId");if(!z.uuid().safeParse(parentId).success)return Response.json({error:"原邮件参数无效"},{status:400});
  const rows=await tenantQuery<{id:string;created_at:string;changes:{draftCiphertext:string}}>(session.userId,`select e.id,e.created_at::text,e.changes from workspace_audit_event e
    join outbound_mail m on m.id::text=e.entity_id and m.user_id=e.actor_user_id
    where e.actor_user_id=$1 and m.id=$2 and e.action='follow-up.generated' order by e.created_at desc,e.id desc limit 10`,[session.userId,parentId]);
  return Response.json({drafts:rows.filter(row=>row.changes.draftCiphertext).map(row=>({id:row.id,createdAt:row.created_at,...decryptMailboxContent(session.userId,row.changes.draftCiphertext)}))},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return Response.json({error:"请填写跟进内容"},{status:400});
  const context=await followUpContext(session.userId,input.data.parentId);
  if(!context)return Response.json({error:"原邮件不存在"},{status:404});
  try {
    const {original,thread,inbound,stylePreferences,threadTruncated}=context;
    const result=await withProductSpend(session.userId,"follow-up-generation",()=>generateFollowUp({instructions:input.data.instructions,originalSubject:original.subject,originalBody:original.bodyText.slice(0,8000),thread,inbound,stylePreferences,threadTruncated}));
    const saved=await tenantQuery<{id:string}>(session.userId,`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'outbound-mail',$3,'follow-up.generated',$4) returning id`,[context.workspaceId,session.userId,input.data.parentId,JSON.stringify({promptVersion:"follow-up-v2",model:result.model,metrics:result.metrics,threadMessages:thread.length,styleMemoryIds:stylePreferences.map(item=>item.id),threadTruncated,
      draftCiphertext:encryptMailboxContent(session.userId,{subject:result.draft.subject,bodyText:result.draft.body,sender:original.sender,recipients:original.recipients}),
      inputItems:1+thread.length+inbound.length+stylePreferences.length,inboundMessages:inbound.length,validOutputItems:1,downstreamUsedItems:0,usageState:"awaiting-user-review",optimizationOpportunity:"Reuse salutation without regenerating strategy; exclude duplicate parent from thread"})]);
    return Response.json({...result,draftId:saved[0].id});
  }catch(error){if(error instanceof BudgetDeniedError)return Response.json({error:error.message,code:error.code},{status:402});return Response.json({error:"跟进草稿生成失败，原邮件和发送记录未改变"},{status:502});}
}
