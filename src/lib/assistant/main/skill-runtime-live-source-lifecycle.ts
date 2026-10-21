import type {PoolClient} from 'pg';
import {digest,messageInputSchema,toolResultSchema,type ModelMessage} from './contracts';
import {skillCandidateTaskSpecSchema} from './evaluation-task-spec';
import {assertSkillRuntimeReadSources} from './skill-runtime-read-sources';
import {revalidateLockedSkillKnowledgeReceiptBytes} from './skill-knowledge-receipt-bytes';
import {prepareSkillRuntimeCandidateSource} from './skill-runtime-candidate-source';
import {assertSkillRuntimeModelDisclosure} from './skill-runtime-disclosure';

type Task={id:string;execution_spec:unknown;snapshot:Record<string,unknown>};
type Read={run_id:string;tool_id:string;input:unknown;snapshot:unknown};
/** Internal retained-reader stage: the parent first authenticates and locks all
 * task/spec/journal rows. Revalidation here is local, never tool dispatch or a
 * model call. Journal fingerprints alone cannot detect changed source payloads. */
export async function revalidateSkillRuntimeLiveSources(client:PoolClient,userId:string,tasks:readonly Task[],reads:readonly Read[]){
 const manifests:Array<{taskId:string;knowledge:unknown}>=[];
 for(const task of tasks){
  const spec=skillCandidateTaskSpecSchema.parse(task.execution_spec);
  if(spec.readExecution!=='registered-live-read-v1')continue;
  const input=messageInputSchema.parse(task.snapshot.input),messages:ModelMessage[]=[],receipts=[];
  for(const row of reads.filter(row=>row.run_id===task.id)){
   const output=toolResultSchema.parse((row.snapshot as {output?:unknown}|null)?.output);
   if(output.status!=='success'&&output.status!=='partial')throw new Error('Runtime live source receipt unavailable');
   const callId=`runtime-source-${receipts.length}`;
   messages.push({role:'assistant',content:null,tool_calls:[{id:callId,type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:row.tool_id,arguments:row.input})}}]},
    {role:'tool',tool_call_id:callId,content:JSON.stringify(output)});
   receipts.push({tool:row.tool_id,input:row.input,output});
  }
  const saved=await prepareSkillRuntimeCandidateSource({userId},{runId:spec.originalRunId,skillId:spec.skillId,version:spec.version});
  if(saved.sourceHash!==spec.snapshotHash)throw new Error('Runtime live activation source snapshot changed');
  await assertSkillRuntimeReadSources({userId,runId:task.id,knowledgeScope:input.knowledgeScope},messages,spec.skillId);
  await assertSkillRuntimeModelDisclosure({userId},messages,saved.snapshot);
  const knowledge=await revalidateLockedSkillKnowledgeReceiptBytes(client,userId,receipts);
  manifests.push({taskId:task.id,knowledge});
 }
 return {runtimeLiveReadSourcesRevalidated:true as const,runtimeLiveReadTaskCount:manifests.length,
  runtimeLiveReadSourceManifestHash:digest(manifests)};
}
