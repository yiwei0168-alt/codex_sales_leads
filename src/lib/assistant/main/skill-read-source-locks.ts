import type {PoolClient} from 'pg';
import {z} from 'zod';

type Receipt={tool_id:string;input:unknown};
export function skillAcceptanceMailIds(receipts:ReadonlyArray<Receipt>){
 return [...new Set(receipts.filter(row=>row.tool_id==='mail_read').map(row=>z.object({messageId:z.uuid()}).strict().parse(row.input).messageId))].sort();
}
export function skillAcceptanceTimelineSelection(receipts:ReadonlyArray<Receipt>){
 const ids=new Set<string>();let includeAll=false;
 for(const row of receipts.filter(row=>row.tool_id==='customer_timeline')){
  const value=z.object({customerId:z.uuid().optional()}).parse(row.input);
  if(value.customerId)ids.add(value.customerId);else includeAll=true;
 }
 return {customerIds:[...ids].sort(),includeAll};
}

/** The caller owns the tenant transaction and retains task/journal locks.
 * Derive private source locks from those authoritative rows, including candidate
 * reads that need not exist in the original task. No tools/providers are called. */
export async function lockSkillReadReceiptSources(client:PoolClient,userId:string,receipts:ReadonlyArray<Receipt>){
 z.uuid().parse(userId);
 const timeline=skillAcceptanceTimelineSelection(receipts);let timelineCustomerCount=0;
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
 const mailIds=skillAcceptanceMailIds(receipts);
 for(let offset=0;offset<mailIds.length;offset+=100){
  const batch=mailIds.slice(offset,offset+100);
  const mail=await client.query<{id:string}>(`select id from mailbox_message where user_id=$1 and id=any($2::uuid[]) order by id for share`,[userId,batch]);
  if(mail.rows.length!==batch.length||new Set(mail.rows.map(row=>row.id)).size!==batch.length
   ||mail.rows.some(row=>!batch.includes(row.id)))throw new Error('Acceptance mail source unavailable');
 }
 return {timelineSourcesLocked:true as const,timelineCustomerCount,mailReadSourcesLocked:true as const,mailCount:mailIds.length};
}
