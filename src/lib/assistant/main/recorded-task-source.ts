import {z} from 'zod';
import {prepareRecordedModeRequest} from './model-request-replay';
import {bindRecordedInitialSource} from './recorded-initial-source';
import {assertRecordedFallbackChain} from './recorded-fallback-chain';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {prepareRecordedTaskChain} from './recorded-task-chain';
import {validateRecordedRequestEvidence} from './model-request-evidence';
import {assertRecordedJournalClosure} from './recorded-journal-closure';
import type {RecordedEvidenceReceipt} from './recorded-evidence-receipts';

type Call={id:string;call_key:string;input:unknown;input_hash:string;output:unknown;status:string};
/** Internal read-only preparation. Contains private messages. No paid calls or effects. */
export async function loadRecordedTaskChain(context:{userId:string},input:{runId:string}){
 const userId=z.uuid().parse(context.userId),{runId}=z.object({runId:z.uuid()}).strict().parse(input);
 const snapshot=()=>tenantTransaction(userId,async client=>{
  const task=(await client.query<{id:string;user_id:string;status:string;execution_kind:string;result:unknown;instructions:unknown;input:unknown;model_config:unknown;updated_at:string}>(
   `select id,user_id,status,execution_kind,result,instructions,input,model_config,updated_at::text from agent_run where id=$1 and user_id=$2`,[runId,userId])).rows[0];
  if(!task||task.id!==runId||task.user_id!==userId||task.status!=='completed'||task.execution_kind!=='main-agent')throw new Error('Recorded task unavailable');
  const journal=(await client.query<RecordedEvidenceReceipt>(`select id,user_id,run_id,call_key,tool_id,tool_version,input,input_hash,effect,status,output,approval_id
   from agent_tool_call where run_id=$1 and user_id=$2 order by call_key,id`,[runId,userId])).rows;
  const calls:Call[]=journal.filter(row=>row.tool_id==='main_model'&&row.effect==='model').map(({id,call_key,input,input_hash,output,status})=>({id,call_key,input,input_hash,output,status}));
  if(!calls.length||calls.some(call=>call.status!=='completed'))throw new Error('Recorded model journal incomplete');
  return {task,calls,journal};
 });
 const saved=await snapshot();
 const fallbackBinding=assertRecordedFallbackChain(saved.calls);
 const successful=saved.calls.filter(call=>z.object({status:z.string()}).parse(call.output).status==='success');
 const first=successful.filter(call=>/^mode-model:0:/.test(call.call_key));
 if(first.length!==1)throw new Error('Recorded initial model decision missing or duplicated');
 const initialBinding=await bindRecordedInitialSource({userId,runId},prepareRecordedModeRequest(first[0]).body.messages);
 const chain=prepareRecordedTaskChain(successful,{
  reply:z.object({reply:z.string()}).parse(saved.task.result).reply,
  instructions:z.array(z.object({content:z.string()})).parse(saved.task.instructions).slice(initialBinding.initialInstructionCount),
 });
 const checked=[];
 for(const turn of chain.turns)checked.push(await validateRecordedRequestEvidence({userId},{runId,callId:turn.id}));
 const journalClosure=assertRecordedJournalClosure({userId,runId},saved.journal,saved.calls.map(row=>row.id),checked.flatMap(row=>row.receiptBinding.receipts));
 const sourceHash=digest(saved);
 if(digest(await snapshot())!==sourceHash)throw new Error('Recorded task changed during preparation');
 if((await bindRecordedInitialSource({userId,runId},chain.turns[0].request.body.messages)).initialSourceHash!==initialBinding.initialSourceHash)throw new Error('Recorded initial sources changed during preparation');
 return {...chain,...initialBinding,fallbackBinding,journalClosure,requests:checked,sourceHash,serverTaskJournalVerified:true as const,
  // Complete tool-output semantics, interrupted recovery and effect adapters remain separate gates.
  wholeTaskProvenanceVerified:false as const,executionAuthorized:false as const,qualityAccepted:false as const};
}
