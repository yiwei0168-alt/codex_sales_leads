import { z } from "zod";
import { requireApiSession } from "@/lib/auth/session";
import { tenantQuery } from "@/lib/rag/db";
import { encryptMailboxContent } from "@/lib/mailbox/crypto";
import { followUpContext } from "@/lib/outreach/follow-up-context";
import { generateFollowUp } from "@/lib/outreach/kimi-agent";
const schema=z.object({parentId:z.uuid(),instructions:z.string().trim().min(2).max(2000)}).strict();
export async function POST(request:Request){
  const session=await requireApiSession();if(session instanceof Response)return session;
  const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return Response.json({error:"请填写跟进内容"},{status:400});
  const context=await followUpContext(session.userId,input.data.parentId);
  if(!context)return Response.json({error:"原邮件不存在"},{status:404});
  try {
    const {original,thread,stylePreferences,threadTruncated}=context;
    const result=await generateFollowUp({instructions:input.data.instructions,originalSubject:original.subject,originalBody:original.bodyText.slice(0,8000),thread,stylePreferences,threadTruncated});
    await tenantQuery(session.userId,`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'outbound-mail',$3,'follow-up.generated',$4)`,[context.workspaceId,session.userId,input.data.parentId,JSON.stringify({promptVersion:"follow-up-v2",model:result.model,metrics:result.metrics,threadMessages:thread.length,styleMemoryIds:stylePreferences.map(item=>item.id),threadTruncated,
      draftCiphertext:encryptMailboxContent(session.userId,{subject:result.draft.subject,bodyText:result.draft.body,sender:original.sender,recipients:original.recipients}),
      inputItems:1,validOutputItems:1,downstreamUsedItems:0,usageState:"awaiting-user-review",optimizationOpportunity:"Reuse salutation without regenerating strategy"})]);
    return Response.json(result);
  }catch{return Response.json({error:"跟进草稿生成失败，原邮件和发送记录未改变"},{status:502});}
}
