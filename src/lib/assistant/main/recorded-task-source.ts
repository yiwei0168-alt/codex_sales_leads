import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {prepareRecordedTaskChain} from './recorded-task-chain';
import {validateRecordedRequestEvidence} from './model-request-evidence';

type Call={id:string;call_key:string;input:unknown;input_hash:string;output:unknown;status:string};
/** Internal read-only preparation. Contains private messages. No paid calls or effects. */
export async function loadRecordedTaskChain(context:{userId:string},input:{runId:string}){
 const userId=z.uuid().parse(context.userId),{runId}=z.object({runId:z.uuid()}).strict().parse(input);
 const snapshot=()=>tenantTransaction(userId,async client=>{
  const task=(await client.query<{id:string;user_id:string;status:string;execution_kind:string;result:unknown;instructions:unknown;input:unknown;model_config:unknown;updated_at:string}>(
   `select id,user_id,status,execution_kind,result,instructions,input,model_config,updated_at::text from agent_run where id=$1 and user_id=$2`,[runId,userId])).rows[0];
  if(!task||task.id!==runId||task.user_id!==userId||task.status!=='completed'||task.execution_kind!=='main-agent')throw new Error('Recorded task unavailable');
  const calls=(await client.query<Call>(`select id,call_key,input,input_hash,output,status from agent_tool_call
   where run_id=$1 and user_id=$2 and tool_id='main_model' and effect='model' order by call_key,id`,[runId,userId])).rows;
  if(!calls.length||calls.some(call=>call.status!=='completed'))throw new Error('Recorded model journal incomplete');
  return {task,calls};
 });
 const saved=await snapshot();
 const successful=saved.calls.filter(call=>z.object({status:z.string()}).parse(call.output).status==='success');
 const chain=prepareRecordedTaskChain(successful,{
  reply:z.object({reply:z.string()}).parse(saved.task.result).reply,
  instructions:z.array(z.object({content:z.string()})).parse(saved.task.instructions),
 });
 const checked=[];
 for(const turn of chain.turns)checked.push(await validateRecordedRequestEvidence({userId},{runId,callId:turn.id}));
 const sourceHash=digest(saved);
 if(digest(await snapshot())!==sourceHash)throw new Error('Recorded task changed during preparation');
 return {...chain,requests:checked,sourceHash,serverTaskJournalVerified:true as const,
  // Initial conversation/attachments and failed-attempt fallback causality require their own binding.
  wholeTaskProvenanceVerified:false as const,executionAuthorized:false as const,qualityAccepted:false as const};
}
