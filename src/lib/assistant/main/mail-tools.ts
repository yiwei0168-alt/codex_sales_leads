import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sendMailSchema, sendOutbound } from "@/lib/mailbox/outbound";
import { defineTool } from "./tool-definition";
import { result, digest, type ExecutionContext } from "./contracts";
import { requestApproval,approvalDigest } from "./approvals";
import { tenantTransaction } from "@/lib/rag/db";
import { executeRegisteredTool } from "./tool-execution";
const mailInput = sendMailSchema.omit({ confirmed: true, idempotencyKey: true }).strict();
export const mailSendTool = defineTool({ id: "mail_send", description: "Send final custom mail with optional company linkage and hash-bound registered attachments. Always requires exact user approval; unknown SMTP receipts are not retried.",
  input: mailInput, effect: "send", recovery: "reconcile", cost: "unknown", connections: ["mailbox"],
  execute: async (i,c) => {
    const receipt=await sendOutbound(c.userId,{...i,confirmed:true,idempotencyKey:randomUUID()});
    return result(receipt,{status:receipt.status==="sent"?"success":receipt.status==="failed"?"unavailable":"unknown",receipt:receipt.id});
  },
});
const batchItem=mailInput.extend({itemId:z.string().min(1).max(100)}).strict();
export const mailBatchSchema=z.object({ batchId:z.string().min(1).max(100),items:z.array(batchItem).min(1).max(50) }).strict()
  .refine(i=>new Set(i.items.map(v=>v.itemId)).size===i.items.length,"Batch item IDs must be unique")
  .refine(i=>new Set(i.items.map(v=>digest(itemMail(v)))).size===i.items.length,"Duplicate identical emails are not separate batch items");
function itemMail(value:z.infer<typeof batchItem>) {const {itemId:_id,...mail}=value;void _id;return mail;}
async function supersedeChangedItems(input:z.infer<typeof mailBatchSchema>,c:ExecutionContext) {
  if(!c.callId)return;
  await tenantTransaction(c.userId,async client=>{
    const previous=await client.query<{input:z.infer<typeof mailBatchSchema>}>(`select input from agent_tool_call where user_id=$1 and run_id=$2 and tool_id='mail_batch_send' and id<>$3 and input->>'batchId'=$4 order by created_at desc,id desc limit 1`,[c.userId,c.runId,c.callId,input.batchId]);
    for(const old of previous.rows[0]?.input.items??[]) {
      const replacement=input.items.find(i=>i.itemId===old.itemId);
      if(replacement&&digest(itemMail(replacement))===digest(itemMail(old)))continue;
      await client.query("update agent_approval set status='revoked',decided_at=now() where user_id=$1 and run_id=$2 and tool_id='mail_send' and parameter_hash=$3 and status in('pending','approved')",[c.userId,c.runId,approvalDigest(mailSendTool,itemMail(old))]);
    }
  });
}
export async function executeMailBatch(input:z.infer<typeof mailBatchSchema>,c:ExecutionContext) {
  await supersedeChangedItems(input,c);
  const approvals=[];
  for(const item of input.items) approvals.push(await requestApproval(c,mailSendTool,itemMail(item)));
  if(approvals.some(a=>a.status==="pending")) return result({items:approvals.map((a,index)=>({index,approvalId:a.id,status:a.status}))},{status:"waiting_approval",missing:["Review each final recipient/body/attachment; approve individually or as this exact batch"]});
  const outputs=[];
  for(const [index,item] of input.items.entries()) outputs.push({index,itemId:item.itemId,output:await executeRegisteredTool(mailSendTool,itemMail(item),`batch:${approvals[index].id}`,c)});
  const success=outputs.filter(i=>i.output.status==="success").length;
  return result({items:outputs,sent:success,total:outputs.length},{status:success===outputs.length?"success":"partial",cost:"unknown"});
}
export const mailBatchTool=defineTool({id:"mail_batch_send",description:"Send an exact reviewed batch. Keep batchId and each itemId stable when revising the batch. Separate final recipient/body/attachment approvals bind each item; changed/removed items revoke only their prior unused approval. Unchanged sent items reuse receipts. All sends use mail_send's central execution hook.",input:mailBatchSchema,effect:"read",recovery:"composite",cost:"unknown",connections:["mailbox"],execute:executeMailBatch});
