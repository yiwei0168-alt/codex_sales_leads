import type {PoolClient} from 'pg';
import {z} from 'zod';
import {messageInputSchema} from './contracts';

type Artifact={plan:{cases:ReadonlyArray<{id:string;provenance:string}>};rawReceipts:Record<string,unknown>};
/** Derive exclusively from the stored bundle, never from request-supplied run IDs. */
export function skillAcceptanceRunIds({plan,rawReceipts}:Artifact){
 const runs=new Set<string>();
 const reference=(name:string,caseId:string)=>z.object({runId:z.uuid()}).passthrough().parse(
  z.record(z.string(),z.unknown()).parse(rawReceipts[name])[caseId]).runId;
 for(const item of plan.cases){
  if(item.provenance==='historical-task'){
   const runId=reference('baselineSources',item.id);
   if(reference('candidateSources',item.id)!==runId)throw new Error('Locked historical arm sources differ');
   runs.add(runId);
  }else if(item.provenance==='prospective-task'||item.provenance==='safety-fixture'){
   runs.add(reference(item.provenance==='prospective-task'?'prospectiveSources':'safetySources',item.id));
  }else throw new Error('Unsupported acceptance source provenance');
 }
 return z.array(z.uuid()).min(1).max(100).parse([...runs].sort());
}
export function skillAcceptanceAttachmentIds(runs:ReadonlyArray<{input:unknown}>){
 const ids=new Set<string>();
 for(const run of runs)for(const attachment of z.object({attachments:messageInputSchema.shape.attachments}).parse(run.input).attachments)ids.add(attachment.assetId);
 return [...ids].sort();
}
export function skillAcceptanceMailIds(receipts:ReadonlyArray<{tool_id:string;input:unknown}>){
 return [...new Set(receipts.filter(row=>row.tool_id==='mail_read').map(row=>z.object({messageId:z.uuid()}).strict().parse(row.input).messageId))].sort();
}
export function skillAcceptanceTimelineSelection(receipts:ReadonlyArray<{tool_id:string;input:unknown}>){
 const ids=new Set<string>();let includeAll=false;
 for(const row of receipts.filter(row=>row.tool_id==='customer_timeline')){
  const value=z.object({customerId:z.uuid().optional()}).parse(row.input);
  if(value.customerId)ids.add(value.customerId);else includeAll=true;
 }
 return {customerIds:[...ids].sort(),includeAll};
}
/** Caller owns the account-bound transaction. Parent UPDATE locks also block new
 * journal rows via their run FK; existing rows require their own SHARE locks.
 * Attachment metadata is locked separately below. External bytes and other
 * evidence domains still require their own protection before activation. */
export async function lockSkillAcceptanceRunJournals(client:PoolClient,userId:string,artifact:Artifact){
 z.uuid().parse(userId);const ids=skillAcceptanceRunIds(artifact);
 const origins=(await client.query<{n:number}>('select lock_skill_task_origins($1::uuid[]) n',[ids])).rows[0]?.n;
 if(origins!==ids.length)throw new Error('Acceptance task origin lock incomplete');
 const runs=await client.query<{id:string;input:unknown}>(`select id,input from agent_run where user_id=$1 and id=any($2::uuid[])
  order by id for update`,[userId,ids]);
 if(runs.rows.length!==ids.length)throw new Error('Acceptance source task unavailable');
 const attachments=skillAcceptanceAttachmentIds(runs.rows);
 for(let offset=0;offset<attachments.length;offset+=100){
  const batch=attachments.slice(offset,offset+100);
  const locked=(await client.query<{n:number}>('select lock_skill_attachment_sources($1::uuid[]) n',[batch])).rows[0]?.n;
  if(locked!==batch.length)throw new Error('Acceptance attachment source lock incomplete');
 }
 const journal=await client.query<{id:string;tool_id:string;input:unknown}>(`select id,tool_id,input from agent_tool_call where user_id=$1 and run_id=any($2::uuid[]) order by id for share`,[userId,ids]);
 const timeline=skillAcceptanceTimelineSelection(journal.rows);let timelineCustomerCount=0;
 const lockTimeline=async(customerIds:string[],includeAll:boolean)=>{
  const locked=(await client.query<{n:number}>('select lock_skill_timeline_sources($1::uuid[],$2::boolean) n',[customerIds,includeAll])).rows[0]?.n;
  if(typeof locked!=='number'||!Number.isInteger(locked)||locked<customerIds.length
   ||(!includeAll&&locked!==customerIds.length))throw new Error('Acceptance timeline source lock incomplete');
  return locked;
 };
 for(let offset=0;offset<timeline.customerIds.length;offset+=100)timelineCustomerCount+=await lockTimeline(timeline.customerIds.slice(offset,offset+100),false);
 if(timeline.includeAll){
  const all=await lockTimeline([],true);
  if(all<timelineCustomerCount)throw new Error('Acceptance timeline source lock incomplete');
  timelineCustomerCount=all;
 }
 const mailIds=skillAcceptanceMailIds(journal.rows);
 for(let offset=0;offset<mailIds.length;offset+=100){
  const batch=mailIds.slice(offset,offset+100);
  const mail=await client.query<{id:string}>(`select id from mailbox_message where user_id=$1 and id=any($2::uuid[]) order by id for share`,[userId,batch]);
  if(mail.rows.length!==batch.length)throw new Error('Acceptance mail source unavailable');
 }
 return {timelineSourcesLocked:true as const,timelineCustomerCount,mailReadSourcesLocked:true as const,mailCount:mailIds.length,attachmentMetadataLocked:true as const,attachmentCount:attachments.length,taskOriginsLocked:true as const,taskJournalsLocked:true as const,runCount:ids.length};
}
