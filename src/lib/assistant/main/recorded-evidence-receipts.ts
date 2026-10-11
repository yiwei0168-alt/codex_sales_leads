import {z} from 'zod';
import {tenantQuery} from '@/lib/rag/db';
import {productTools} from './tools';
import {digest,type ModelMessage,type ProductTool} from './contracts';

export type RecordedEvidenceReceipt={id:string;user_id:string;run_id:string;call_key:string;tool_id:string;tool_version:string;
 input:unknown;input_hash:string;effect:string;status:string;output:unknown;approval_id:string|null};
type Reference={id:string;callKey:string;tool:string;input:unknown;output:unknown};
function references(messages:ModelMessage[]):Reference[]{
 const calls=new Map<string,{tool:string;input:unknown}>(),refs:Reference[]=[];
 for(const message of messages){
  for(const call of message.tool_calls??[]){
   if(call.function.name!=='execute_tool')continue;
   if(calls.has(call.id))throw new Error('Receipt call identity duplicated');
   const args=z.object({tool:z.string(),arguments:z.record(z.string(),z.unknown())}).strict().parse(JSON.parse(call.function.arguments));
   calls.set(call.id,{tool:args.tool,input:args.arguments});
  }
  if(message.role!=='tool')continue;
  const call=calls.get(message.tool_call_id??'');if(!call)continue;
  const output=JSON.parse(message.content??'null');
  const id=z.object({callId:z.uuid()}).parse(output).callId;
  refs.push({id,callKey:message.tool_call_id!,...call,output});
 }
 if(new Set(refs.map(r=>r.id)).size!==refs.length)throw new Error('Receipt identity reused');
 return refs;
}
/** Pair/contract checks are prerequisites. This checks the authoritative read receipts, not message assertions. */
export function bindRecordedEvidenceReceipts(context:{userId:string;runId:string},messages:ModelMessage[],rows:RecordedEvidenceReceipt[],registry:ProductTool[]=productTools){
 const refs=references(messages);
 if(rows.length!==refs.length)throw new Error('Recorded evidence receipt missing');
 const bound=refs.map(ref=>{
  const row=rows.find(r=>r.id===ref.id),tool=registry.find(t=>t.id===ref.tool);
  if(!row||!tool||row.user_id!==context.userId||row.run_id!==context.runId||row.call_key!==ref.callKey
   ||row.tool_id!==ref.tool||row.tool_version!==tool.version||row.effect!=='read'||tool.effect!=='read'
   ||row.approval_id!==null||row.status!=='completed'||row.input_hash!==digest(row.input)
   ||digest(tool.input.parse(ref.input))!==row.input_hash||digest(row.output)!==digest(ref.output))
   throw new Error('Recorded evidence receipt mismatch');
  return {id:row.id,hash:digest(row)};
 });
 return {receipts:bound,receiptHash:digest(bound)};
}
/** Local database reads only. No dispatch, provider, approval consumption or receipt creation. */
export async function loadRecordedEvidenceReceipts(context:{userId:string;runId:string},messages:ModelMessage[]){
 const refs=references(messages);
 const rows=refs.length?await tenantQuery<RecordedEvidenceReceipt>(context.userId,`select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id
  from agent_tool_call where user_id=$1 and run_id=$2 and id=any($3::uuid[])`,[context.userId,context.runId,refs.map(r=>r.id)]):[];
 return bindRecordedEvidenceReceipts(context,messages,rows);
}
