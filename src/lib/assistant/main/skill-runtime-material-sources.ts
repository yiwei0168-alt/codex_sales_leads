import {z} from 'zod';
import type {PoolClient} from 'pg';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {historicalCandidateReferenceSchema} from './skill-historical-candidate-reference';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';
import {skillCandidateTaskSpecSchema} from './evaluation-task-spec';

type Artifact={plan:unknown;rawReceipts:unknown};
/** Keep ordinary source-run IDs separate: they own original prompts, attachments
 * and execution identities. Runtime task IDs own new journals, never originals. */
export function skillRuntimeMaterialReferences(artifact:Artifact){
 const plan=z.object({cases:z.array(z.object({id:z.string(),provenance:z.string()}).passthrough())}).passthrough().parse(artifact.plan);
 const references:Array<{caseId:string;runId:string;evaluationId:string;taskId:string}>=[];
 for(const item of plan.cases.filter(row=>row.provenance==='historical-task')){
  const raw=z.record(z.string(),z.unknown()).parse(z.record(z.string(),z.unknown()).parse(artifact.rawReceipts).candidateSources)[item.id];
  if(!z.object({taskId:z.uuid().optional()}).passthrough().parse(raw).taskId)continue;
  const reference=historicalCandidateReferenceSchema.parse(raw);
  if(reference.taskId)references.push({caseId:item.id,runId:reference.runId,evaluationId:reference.evaluationId,taskId:reference.taskId});
 }
 if(references.length>100||new Set(references.map(row=>row.taskId)).size!==references.length)throw new Error('Runtime material task references duplicate or oversized');
 return references.sort((a,b)=>a.taskId.localeCompare(b.taskId));
}

/** Row locks and fingerprint only, not model, provider or quality qualification.
 * Parent UPDATE locks stop new tool rows via FK; SHARE locks retain old outputs. */
export async function lockSkillRuntimeMaterialSources(client:PoolClient,userId:string,artifact:Artifact){
 const refs=skillRuntimeMaterialReferences(artifact);
 if(!refs.length)return {runtimeTaskSourcesLocked:true as const,runtimeTaskCount:0,runtimeTaskLedgerHash:null};
 const plan=skillAcceptancePlanSchema.parse(artifact.plan),freezeId=z.object({collector:z.object({freezeId:z.uuid()}).passthrough()}).passthrough().parse(artifact.rawReceipts).collector.freezeId;
 if(plan.pin.ownerId!==userId)throw new Error('Runtime material owner changed');
 return withBoundTenantTransaction(client,userId,async()=>{
  const tasks=(await client.query<{id:string;user_id:string;status:string;execution_kind:string;execution_spec:unknown;snapshot:Record<string,unknown>}>(
   `select r.id,r.user_id,r.status,r.execution_kind,r.execution_spec,to_jsonb(r) snapshot from agent_run r
    where r.user_id=$1 and r.id=any($2::uuid[]) order by r.id for update of r`,[userId,refs.map(row=>row.taskId)])).rows;
  if(tasks.length!==refs.length)throw new Error('Runtime material task unavailable');
  for(const task of tasks){
   const ref=refs.find(row=>row.taskId===task.id)!,spec=skillCandidateTaskSpecSchema.parse(task.execution_spec),item=plan.cases.find(row=>row.id===ref.caseId);
   if(task.user_id!==userId||task.status!=='completed'||task.execution_kind!=='main-agent-evaluation'||!item
    ||spec.freezeId!==freezeId||spec.planHash!==digest(plan)||spec.originalRunId!==ref.runId||spec.evaluationId!==ref.evaluationId||spec.arm!=='candidate'
    ||spec.caseId!==ref.caseId||spec.skillId!==plan.pin.skillId||spec.version!==plan.pin.version||spec.contentHash!==plan.pin.contentHash
    ||spec.identityHash!==digest(plan.identity)||spec.inputHash!==item.inputHash||spec.sourceHash!==item.sourceHash)
    throw new Error('Runtime material task binding changed');
   z.object({reply:z.string()}).strict().parse(task.snapshot.result);
  }
  const tools=(await client.query<{user_id:string;run_id:string;effect:string;status:string;input:unknown;input_hash:string;approval_id:string|null;snapshot:unknown}>(
   `select c.user_id,c.run_id,c.effect,c.status,c.input,c.input_hash,c.approval_id,to_jsonb(c) snapshot from agent_tool_call c
    where c.user_id=$1 and c.run_id=any($2::uuid[]) order by c.id limit 10001 for share of c`,[userId,refs.map(row=>row.taskId)])).rows;
  if(tools.length>10000||tools.some(row=>row.user_id!==userId||!refs.some(ref=>ref.taskId===row.run_id)||row.effect!=='read'||row.status!=='completed'
   ||row.approval_id!==null||digest(row.input)!==row.input_hash))throw new Error('Runtime material journal binding changed');
  return {runtimeTaskSourcesLocked:true as const,runtimeTaskCount:tasks.length,
   runtimeTaskLedgerHash:digest({protocol:'skill-runtime-material-ledger-v1',tasks:tasks.map(row=>row.snapshot),tools:tools.map(row=>row.snapshot)})};
 });
}
