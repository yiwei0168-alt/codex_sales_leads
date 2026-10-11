import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {prepareRecordedModeRequest} from './model-request-replay';

const selection=z.object({runId:z.uuid(),callId:z.uuid()}).strict();
type Selection=z.infer<typeof selection>;
type Row={id:string;user_id:string;run_id:string;tool_id:string;tool_version:string;effect:string;status:string;
 input:unknown;input_hash:string;output:unknown;run_input:unknown;run_instructions:unknown;run_result:unknown;
 run_model_config:unknown;run_status:string;execution_kind:string;account_status:string;run_updated_at:string};
/** Internal only: no HTTP/Agent entry point and no model/tool dispatch.
 * Database provenance is distinct from current evidence ACL and evaluation authorization.
 */
export async function loadRecordedModeRequest(context:{userId:string},input:Selection){
 const owner=z.uuid().parse(context.userId),p=selection.parse(input);
 return tenantTransaction(owner,async client=>{
  const row=(await client.query<Row>(`select c.id,c.user_id,c.run_id,c.tool_id,c.tool_version,c.effect,c.status,
   c.input,c.input_hash,c.output,r.input as run_input,r.instructions as run_instructions,r.result as run_result,
   r.model_config as run_model_config,r.status as run_status,r.execution_kind,u.status as account_status,
   r.updated_at::text as run_updated_at
   from agent_tool_call c join agent_run r on r.id=c.run_id and r.user_id=c.user_id
   join app_user u on u.id=r.user_id
   where c.id=$1 and c.run_id=$2 and c.user_id=$3 and r.user_id=$3`,[p.callId,p.runId,owner])).rows[0];
  if(!row||row.user_id!==owner||row.id!==p.callId||row.run_id!==p.runId||row.account_status!=='active'
   ||row.run_status!=='completed'||row.execution_kind!=='main-agent'||row.status!=='completed'
   ||row.tool_id!=='main_model'||row.effect!=='model'||!row.tool_version)throw new Error('Recorded model source unavailable');
  const prepared=prepareRecordedModeRequest({input:row.input,input_hash:row.input_hash,output:row.output});
  const binding={protocol:'recorded-mode-source-v1' as const,ownerId:owner,runId:p.runId,callId:p.callId,
   rowHash:digest(row),journalHash:prepared.journalHash,requestHash:prepared.requestHash};
  return {...prepared,serverProvenanceVerified:true as const,binding,sourceHash:digest(binding)};
 });
}
/** Re-read the authoritative row before use; a saved disk object cannot supply current provenance. */
export async function revalidateRecordedModeRequest(context:{userId:string},input:Selection,expectedSourceHash:string){
 z.string().regex(/^[a-f0-9]{64}$/).parse(expectedSourceHash);
 const current=await loadRecordedModeRequest(context,input);
 if(current.sourceHash!==expectedSourceHash)throw new Error('Recorded model source changed');
 return current;
}
