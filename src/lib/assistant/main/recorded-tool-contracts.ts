import {z} from 'zod';
import {availableTools,describeTool,productTools} from './tools';
import {digest,toolResultSchema,type ExecutionContext,type ModelMessage} from './contracts';

type Context=Pick<ExecutionContext,'userId'|'role'|'mode'|'knowledgeScope'>;
/** Inspect contracts only. Never dispatch tools, acquire connections or run effects. */
export function assertRecordedToolContracts(context:Context,messages:ModelMessage[],registry=productTools){
 const allowed=availableTools(context,registry),pending=new Map<string,{metadata?:unknown}>(),seen=new Set<string>();
 for(const message of messages){
  if(message.role==='tool'){
   const id=message.tool_call_id??'',call=pending.get(id);
   if(!call)throw new Error('Recorded tool result has no unique preceding call');
   pending.delete(id);
   const output=toolResultSchema.parse(JSON.parse(message.content??'null'));
   if(!['success','partial'].includes(output.status)||output.data==null)throw new Error('Recorded tool result unavailable');
   if(call.metadata!==undefined&&(output.status!=='success'||digest(output.data)!==digest(call.metadata)))throw new Error('Recorded tool metadata changed');
   continue;
  }
  if(pending.size)throw new Error('Recorded tool results incomplete');
  if(message.role!=='assistant'&&message.tool_calls?.length)throw new Error('Recorded tool role invalid');
  for(const call of message.tool_calls??[]){
   if(!call.id||seen.has(call.id))throw new Error('Recorded tool identity reused');
   seen.add(call.id);
   const args=JSON.parse(call.function.arguments);
   if(call.function.name==='discover_tools'){
    z.object({}).strict().parse(args);
    pending.set(call.id,{metadata:allowed.map(t=>({id:t.id,description:t.description,effect:t.effect,cost:t.cost}))});
   }else if(call.function.name==='describe_tool'){
    const p=z.object({tool:z.string()}).strict().parse(args),tool=allowed.find(t=>t.id===p.tool);
    if(!tool)throw new Error('Recorded tool no longer accessible');
    pending.set(call.id,{metadata:describeTool(tool)});
   }else if(call.function.name==='execute_tool'){
    const p=z.object({tool:z.string(),arguments:z.record(z.string(),z.unknown())}).strict().parse(args),tool=allowed.find(t=>t.id===p.tool);
    if(!tool)throw new Error('Recorded tool no longer accessible');
    tool.input.parse(p.arguments);
    // This preparation path has source guards for reads only; effects need a journal-only replay adapter.
    if(tool.effect!=='read')throw new Error('Recorded effect requires receipt-only adapter');
    pending.set(call.id,{});
   }else throw new Error('Recorded tool protocol unsupported');
  }
 }
 if(pending.size)throw new Error('Recorded tool results incomplete');
}
