import {z} from 'zod';
import {digest,type ModelMessage} from './contracts';
import {modelReplySchema,transportMessages} from './model';
import {prepareRecordedModeRequest,type RecordedModelCall} from './model-request-replay';

type Turn=RecordedModelCall&{id:string;call_key:string};
/** Integrity only: inputs must still be loaded from the account-owned authoritative task journal.
 * No model execution or acceptance inference. Initial conversation provenance is a separate check.
 */
export function prepareRecordedTaskChain(turns:Turn[],task:{reply:string;instructions:Array<{content:string}>}){
 if(!turns.length)throw new Error('Recorded task has no model turns');
 const ids=new Set<string>();
 const prepared=turns.map(turn=>{
  if(ids.has(turn.id))throw new Error('Recorded model receipt duplicated');ids.add(turn.id);
  const key=/^mode-model:(\d+):(\d+):([012])$/.exec(turn.call_key);
  if(!key)throw new Error('Recorded model key unsupported');
  const request=prepareRecordedModeRequest(turn);
  if(request.routeIndex!==Number(key[3]))throw new Error('Recorded route key mismatch');
  const output=z.object({data:z.object({value:z.object({message:modelReplySchema})})}).parse(turn.output);
  const reply=transportMessages([output.data.value.message as ModelMessage])[0];
  return {id:turn.id,step:Number(key[1]),revision:Number(key[2]),request,reply};
 }).sort((a,b)=>a.step-b.step);
 const usedInstructions=new Map<string,number>();
 const allowed=new Map<string,number>();for(const instruction of task.instructions)allowed.set(instruction.content,(allowed.get(instruction.content)??0)+1);
 let prior:typeof prepared[number]|undefined;
 for(const turn of prepared){
  if(turn.step!==(prior?prior.step+1:0))throw new Error('Recorded model turn gap or duplicate');
  if(prior&&turn.revision<prior.revision)throw new Error('Recorded decision revision regressed');
  const messages=turn.request.body.messages;
  // The decision-memory injection is replaced on every model decision; all other history is cumulative.
  if(messages[1]?.role!=='system')throw new Error('Recorded decision memory slot missing');
  const history=[messages[0],...messages.slice(2)];
  if(prior){
   const old=prior.request.body.messages,expected=[old[0],...old.slice(2),prior.reply];
   if(digest(history.slice(0,expected.length))!==digest(expected))throw new Error('Recorded model history diverged');
   const pending=new Set((prior.reply.tool_calls??[]).map(call=>call.id));
   for(const message of history.slice(expected.length)){
    if(message.role==='tool'){
     if(!pending.delete(message.tool_call_id??''))throw new Error('Recorded model tool result unpaired');
    }else if(message.role==='user'){
     if(pending.size||turn.revision===prior.revision)throw new Error('Recorded instruction order invalid');
     const content=message.content??'',count=(usedInstructions.get(content)??0)+1;
     if(count>(allowed.get(content)??0))throw new Error('Recorded instruction lacks task provenance');
     usedInstructions.set(content,count);
    }else if(message.role==='system'&&message.content==='Account preferences or policies changed. Replan from the current policy records before further actions.'&&turn.revision>prior.revision){
     if(pending.size)throw new Error('Recorded policy boundary order invalid');
    }else throw new Error('Recorded model history contains an unbound message');
   }
   if(pending.size)throw new Error('Recorded model tool results missing');
  }
  prior=turn;
 }
 const last=prepared.at(-1)!;
 if(last.reply.tool_calls?.length||last.reply.content!==task.reply)throw new Error('Recorded final answer does not match task');
 return {turns:prepared,chainHash:digest({turns,task}),taskChainIntegrityVerified:true as const,
  initialConversationProvenanceVerified:false as const,executionAuthorized:false as const,qualityAccepted:false as const};
}
