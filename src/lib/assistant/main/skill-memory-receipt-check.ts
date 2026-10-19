import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {ModelMessage} from './contracts';
import {assertCurrentMemoryMessages} from './memory-message-guard';

const tools=new Set(['memory_read','memory_history_search','memory_observation_search']);
/** Requires authenticated, consumed receipts and retained source admission.
 * Explicit historical times stay historical; omitted observation times use
 * one database wall-clock instant rather than the transaction start time. */
export async function revalidateLockedSkillMemoryReceipts(client:PoolClient,userId:string,receipts:ReadonlyArray<{tool:string;input:unknown;output:unknown}>){
 z.uuid().parse(userId);const messages:ModelMessage[]=[];let count=0;
 for(const receipt of receipts){
  if(!tools.has(receipt.tool))continue;
  const args=z.record(z.string(),z.unknown()).parse(receipt.input);
  z.object({status:z.enum(['success','partial']),data:z.unknown()}).parse(receipt.output);
  const id=`memory-receipt-${count++}`;
  messages.push({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:receipt.tool,arguments:args})}}]},
   {role:'tool',tool_call_id:id,content:JSON.stringify(receipt.output)});
 }
 const clock=(await client.query<{checked_at:Date}>('select clock_timestamp() checked_at')).rows[0]?.checked_at;
 if(!(clock instanceof Date)||!Number.isFinite(clock.getTime()))throw new Error('Acceptance memory receipt clock unavailable');
 const checkedAt=clock.toISOString();
 await assertCurrentMemoryMessages(userId,messages,checkedAt);
 return {memoryReceiptSourcesRevalidated:true as const,memoryReceiptCount:count,memoryReceiptCheckedAt:checkedAt};
}
