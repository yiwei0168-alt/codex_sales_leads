import {z} from 'zod';
import {digest,type ModelMessage} from './contracts';
import {loadDecisionMemory,searchHistoricalMemory,historicalMemoryInput} from './memory-context';
import {searchMemoryWithGraph} from '@/lib/knowledge/memory-graph-search';

export const MEMORY_CHANGED_REPLY='本任务使用的记忆或政策已更正、撤销、超出当前范围，或暂时无法复核。已停止使用旧内容和执行后续操作，请重新发起任务读取当前记录。';
export class MemoryContextChangedError extends Error {constructor(){super('Memory context validation failed');}}
const scopeSchema=z.object({market:z.string().regex(/^[A-Z]{2}$/).optional(),company:z.string().max(180).optional()}).strict();
const observationSchema=z.object({query:z.string().trim().min(1).max(200),businessAt:z.iso.datetime().optional(),knownAt:z.iso.datetime().optional(),
  marketCode:z.string().regex(/^[A-Z]{2}$/).optional(),companyId:z.string().min(1).max(180).optional()}).strict();
const rowsSchema=z.array(z.object({id:z.uuid()}).passthrough()).max(1000);
// pg dates and their serialized tool receipts must have the same fingerprint.
const wireDigest=(value:unknown)=>digest(JSON.parse(JSON.stringify(value)));

export async function withCurrentDecisionMemory<T>(userId:string,model:()=>Promise<T>):Promise<T>{
  const current=async()=>{try{return wireDigest(await loadDecisionMemory(userId));}catch{throw new MemoryContextChangedError();}};
  const before=await current();
  const reply=await model(); // Preserve real model/transport error types.
  if(await current()!==before)throw new MemoryContextChangedError();
  return reply;
}

/** Re-read only deterministic local stores; graph and model services are never called here. */
export async function assertCurrentMemoryMessages(userId:string,messages:ModelMessage[]){
  try{
    const calls=new Map<string,{tool:string;arguments:unknown}>();
    for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
      if(call.function.name!=='execute_tool')continue;
      try{const p=JSON.parse(call.function.arguments);if(['memory_read','memory_history_search','memory_observation_search'].includes(p.tool))calls.set(call.id,p);}catch{/* Not executable. */}
    }
    for(const message of messages){
      if(message.role!=='tool')continue;
      const call=calls.get(message.tool_call_id??'');if(!call)continue;
      const output=JSON.parse(message.content??'{}');if(!['success','partial'].includes(output.status))continue;
      let saved:unknown,current:unknown;
      if(call.tool==='memory_read'){
        saved=output.data;current=await loadDecisionMemory(userId,scopeSchema.parse(call.arguments));
      }else if(call.tool==='memory_history_search'){
        saved=output.data?.items;current=(await searchHistoricalMemory(userId,historicalMemoryInput.parse(call.arguments))).items;
      }else{
        const p=observationSchema.parse(call.arguments),now=new Date().toISOString();
        saved=output.data?.rows;const ids=rowsSchema.parse(saved).map(r=>r.id);
        current=(await searchMemoryWithGraph(userId,p.query,p.businessAt??now,p.knownAt??now,
          {marketCode:p.marketCode,companyId:p.companyId},async()=>ids)).rows;
      }
      const before=rowsSchema.parse(saved),after=rowsSchema.parse(current);
      for(const row of before){
        const present=after.find(r=>r.id===row.id&&r.source_store===row.source_store);
        if(!present||wireDigest(present)!==wireDigest(row))throw new MemoryContextChangedError();
      }
    }
  }catch{throw new MemoryContextChangedError();}
}
