import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sendMailSchema } from "@/lib/mailbox/outbound";
import { loadMailAttachments } from "@/lib/mailbox/attachments";
import { tenantQuery } from "@/lib/rag/db";
import { enqueueRun } from "./repository";
import { defaultModelConfig } from "./product";
import { requestApproval,decideApproval } from "./approvals";
import { mailSendTool,mailBatchSchema } from "./mail-tools";
/** Authenticated human form entry only. The Agent registry does not expose this function. */
export async function queueReviewedMail(userId:string,role:"admin"|"member",input:z.infer<typeof sendMailSchema>) {
  const parsed=sendMailSchema.parse(input);
  const {confirmed:_confirmed,idempotencyKey,...mail}=parsed;void _confirmed;
  const connection=await tenantQuery(userId,"select id from mailbox_connection where user_id=$1 and id=$2 and status='active' and smtp_verified_at is not null",[userId,mail.connectionId]);
  if(!connection.length)throw new Error("Verified owned sender connection required");
  await loadMailAttachments(userId,mail.attachments??[]);
  const spec=mailBatchSchema.parse({batchId:"reviewed-mail",items:[{...mail,itemId:"mail"}]});
  const run=await enqueueRun(userId,{content:`发送已审核邮件：${mail.subject}`,requestKey:`mail-ui:${idempotencyKey}`,attachments:(mail.attachments??[]).map(a=>({assetId:a.assetId}))},defaultModelConfig(),{kind:"mail",spec,paused:true});
  const approval=await requestApproval({userId,runId:run.id,leaseToken:randomUUID(),role},mailSendTool,mail);
  if(approval.status==="pending") {
    if(!await decideApproval(userId,approval.id,approval.parameter_hash,"approve"))throw new Error("Approval changed");
  } else if(!["approved","consumed"].includes(approval.status))throw new Error("Review changed or expired; create a new reviewed request");
  // First admission starts paused, so the worker cannot race ahead of approval.
  await tenantQuery(userId,"update agent_run set status='queued',updated_at=now() where user_id=$1 and id=$2 and status='paused' and execution_kind='mail' and lease_token is null",[userId,run.id]);
  return {status:run.status==="completed"?"sent":["partial","failed","cancelled"].includes(run.status)?"unknown":"queued",runId:run.id};
}
