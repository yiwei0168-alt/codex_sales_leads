import {z} from 'zod';
import type {ModelMessage} from './contracts';
import {assertCurrentPrivateReplayMessages,PRIVATE_REPLAY_TOOLS} from './private-replay-guard';

/** Re-read only consumed private receipts under the caller's bound tenant
 * transaction and retained source locks. Never dispatches tools or calls IMAP. */
export async function revalidateLockedSkillPrivateReceipts(userId:string,receipts:ReadonlyArray<{tool:string;input:unknown;output:unknown}>){
 z.uuid().parse(userId);const messages:ModelMessage[]=[];let count=0;
 for(const receipt of receipts){
  if(!PRIVATE_REPLAY_TOOLS.some(tool=>tool===receipt.tool))continue;
  const args=z.record(z.string(),z.unknown()).parse(receipt.input);
  z.object({status:z.enum(['success','partial']),data:z.unknown()}).parse(receipt.output);
  const id=`private-receipt-${count++}`;
  messages.push({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:receipt.tool,arguments:args})}}]},
   {role:'tool',tool_call_id:id,content:JSON.stringify(receipt.output)});
 }
 await assertCurrentPrivateReplayMessages(userId,messages);
 return {privateReceiptSourcesRevalidated:true as const,privateReceiptCount:count};
}
