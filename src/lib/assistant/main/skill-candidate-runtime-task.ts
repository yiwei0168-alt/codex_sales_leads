import {z} from 'zod';
import {tenantTransaction,withBoundTenantTransaction} from '@/lib/rag/db';
import {digest,messageInputSchema,type AgentRun,type ExecutionContext,type ModelConfig} from './contracts';
import {enqueueRun,finishRun} from './repository';
import {skillAcceptancePlanSchema} from './skill-acceptance-policy';
import {inspectLockedSkillAcceptanceFreeze} from './skill-acceptance-freeze';
import {prepareRecordedSkillCandidateSnapshot} from './skill-candidate-source';
import {prepareSkillAcceptanceBaseline} from './skill-acceptance-baseline';
import {prepareSkillExecutionIdentity} from './skill-runtime-identity';
import {skillCandidateTaskSpecSchema} from './evaluation-task-spec';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

const selection=z.object({runId:z.uuid(),skillId:z.uuid(),version:z.number().int().positive(),freezeId:z.uuid(),
 caseId:z.string().min(1).max(200),evaluationId:z.uuid(),arm:z.enum(['baseline','candidate'])}).strict();
type Selection=z.infer<typeof selection>;
type Prepared={spec:z.infer<typeof skillCandidateTaskSpecSchema>;input:z.infer<typeof messageInputSchema>;model:ModelConfig;role:'member'|'admin';originalKnowledgeScope?:ExecutionContext['knowledgeScope']};

/** Internal G09 admission only. Does not call a model, dispatch tools or qualify
 * production evidence. G16 manifest/Gold/financial admission is a separate schema. */
async function withPreparedTask<T>(context:{userId:string},input:Selection,expectedPlan:unknown,work:(prepared:Prepared)=>Promise<T>){
 assertLocalAnalysisBoundary();z.uuid().parse(context.userId);const p=selection.parse(input),plan=skillAcceptancePlanSchema.parse(expectedPlan);
 if(plan.pin.ownerId!==context.userId||plan.pin.skillId!==p.skillId||plan.pin.version!==p.version)throw new Error('Skill runtime task plan owner or version changed');
 return tenantTransaction(context.userId,client=>withBoundTenantTransaction(client,context.userId,async()=>{
  if(await inspectLockedSkillAcceptanceFreeze(client,context.userId,p.freezeId,plan)!=='active')throw new Error('Skill runtime task freeze unavailable');
  const original=(await client.query<AgentRun&{role:'member'|'admin'}>(`select r.*,u.role from agent_run r join app_user u on u.id=r.user_id
   where r.id=$1 and r.user_id=$2 and r.status='completed' and r.execution_kind='main-agent' and u.status='active' for share of r,u`,[p.runId,context.userId])).rows[0];
  if(!original)throw new Error('Skill runtime original task unavailable');
  const saved=await prepareRecordedSkillCandidateSnapshot(context,{runId:p.runId,skillId:p.skillId,version:p.version});
  const baseline=await prepareSkillAcceptanceBaseline(context,{runId:p.runId});
  const identity=await prepareSkillExecutionIdentity(context,{runId:p.runId});
  const item=plan.cases.find(row=>row.id===p.caseId);
  if(!item||item.category!=='replay'||item.provenance!=='historical-task'||item.inputHash!==saved.taskInputHash
   ||item.sourceHash!==baseline.projectionHash||plan.pin.contentHash!==saved.snapshot.candidate.value.content_hash
   ||plan.pin.sourceHash!==saved.skillSourceHash||digest(plan.identity)!==digest(identity)
   ||digest(original.model_config)!==saved.modelConfigHash||original.role!==saved.snapshot.context.role)
   throw new Error('Skill runtime task sources or frozen identity changed');
  const spec=skillCandidateTaskSpecSchema.parse({schema:'skill-candidate-task-v1',freezeId:p.freezeId,planHash:digest(plan),caseId:p.caseId,
   evaluationId:p.evaluationId,arm:p.arm,originalRunId:p.runId,skillId:p.skillId,version:p.version,contentHash:plan.pin.contentHash,
   snapshotHash:saved.sourceHash,inputHash:saved.taskInputHash,sourceHash:baseline.projectionHash,identityHash:digest(identity)});
  const taskInput=messageInputSchema.parse({content:original.input.content,requestKey:`skill-runtime:${digest(spec)}`,
   attachments:[],mode:saved.snapshot.profile.mode,knowledgeScope:original.input.knowledgeScope??['industry','company','product']});
  const result=await work({spec,input:taskInput,model:original.model_config,role:original.role,originalKnowledgeScope:original.input.knowledgeScope});
  if(await inspectLockedSkillAcceptanceFreeze(client,context.userId,p.freezeId,plan)!=='active')throw new Error('Skill runtime task freeze expired during admission');
  return result;
 }));
}

/** Hidden task metadata binds the original attachment-bearing prompt by hash;
 * no new user message, attachment registration or memory extraction is created. */
export async function enqueueSkillCandidateRuntimeTask(context:{userId:string},input:Selection,expectedPlan:unknown){
 return withPreparedTask(context,input,expectedPlan,async prepared=>{
  const run=await enqueueRun(context.userId,prepared.input,prepared.model,{kind:'main-agent-evaluation',spec:prepared.spec});
  return {runId:run.id,specHash:digest(prepared.spec),productionAgentEquivalent:false,executionAuthorized:false,automaticActivation:false};
 });
}

/** Inspect only the exact server-derived task before selecting claim or
 * completed-result reuse. No arbitrary task ID or supplied status is trusted. */
export async function inspectSkillCandidateRuntimeTask(context:{userId:string},input:Selection&{taskId:string},expectedPlan:unknown){
 const {taskId,...pin}=input;z.uuid().parse(taskId);
 return withPreparedTask(context,pin,expectedPlan,async prepared=>tenantTransaction(context.userId,async client=>{
  const row=(await client.query<{status:string;control:string|null}>(`select status,control from agent_run
   where id=$1 and user_id=$2 and execution_kind='main-agent-evaluation' and execution_spec=$3::jsonb
    and input=$4::jsonb and model_config=$5::jsonb`,
  [taskId,context.userId,JSON.stringify(prepared.spec),JSON.stringify(prepared.input),JSON.stringify(prepared.model)])).rows[0];
  if(!row)throw new Error('Skill runtime task unavailable or changed');return row;
 }));
}

/** Explicit claim only: ordinary and G16 workers cannot claim this schema. */
export async function claimSkillCandidateRuntimeTask(context:{userId:string},input:Selection&{taskId:string;workerId:string},expectedPlan:unknown){
 const {taskId,workerId,...pin}=input;z.uuid().parse(taskId);z.string().trim().min(1).max(120).parse(workerId);
 return withPreparedTask(context,pin,expectedPlan,async prepared=>tenantTransaction(context.userId,async client=>{
  const row=(await client.query<AgentRun>(`update agent_run set status='running',worker_id=$3,lease_token=gen_random_uuid(),
   lease_until=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp()
   where id=$1 and user_id=$2 and execution_kind='main-agent-evaluation' and execution_version='main-agent-v1'
    and execution_spec=$4::jsonb and input=$5::jsonb and model_config=$6::jsonb and control is null
    and ((status='queued' and next_attempt_at<=clock_timestamp()) or(status='running' and lease_until<=clock_timestamp())) returning *`,
  [taskId,context.userId,workerId,JSON.stringify(prepared.spec),JSON.stringify(prepared.input),JSON.stringify(prepared.model)])).rows[0];
  if(!row)throw new Error('Skill runtime task unavailable, controlled or already leased');
  return {context:{userId:context.userId,runId:row.id,leaseToken:row.lease_token!,role:prepared.role,mode:prepared.input.mode,
   knowledgeScope:prepared.originalKnowledgeScope,evaluationArm:prepared.spec.arm,skillTaskSpecHash:digest(prepared.spec)} satisfies ExecutionContext,specHash:digest(prepared.spec),
   productionAgentEquivalent:false,executionAuthorized:false,automaticActivation:false};
 }));
}

/** Rebuild the frozen server binding before model/tool work. No caller-supplied
 * prompt, scope, tools, results or qualification booleans are accepted. */
export async function assertSkillCandidateRuntimeTask(context:ExecutionContext,input:Selection,expectedPlan:unknown){
 return withPreparedTask(context,input,expectedPlan,async prepared=>tenantTransaction(context.userId,async client=>{
  const row=(await client.query(`select 1 from agent_run where id=$1 and user_id=$2 and lease_token=$3 and status='running'
   and lease_until>clock_timestamp() and control is null and execution_kind='main-agent-evaluation'
   and execution_spec=$4::jsonb and input=$5::jsonb and model_config=$6::jsonb`,
  [context.runId,context.userId,context.leaseToken,JSON.stringify(prepared.spec),JSON.stringify(prepared.input),JSON.stringify(prepared.model)])).rows[0];
  if(!row||context.evaluationArm!==prepared.spec.arm||context.role!==prepared.role||context.mode!==prepared.input.mode
   ||context.skillTaskSpecHash!==digest(prepared.spec)||digest(context.knowledgeScope)!==digest(prepared.originalKnowledgeScope))throw new Error('Skill runtime task lease or context changed');
  return {specHash:digest(prepared.spec),sourcesCurrent:true,productionAgentEquivalent:false,executionAuthorized:false};
 }));
}

/** Dispatcher entry derives the expected plan and selection from owned storage,
 * never from an HTTP body or the caller's proposed scope. */
export async function assertSkillCandidateRuntimeTaskContext(context:ExecutionContext){
 const saved=await tenantTransaction(context.userId,async client=>{
  const row=(await client.query<{execution_spec:unknown;plan_draft:Record<string,unknown>;frozen_at:Date}>(`select r.execution_spec,f.plan_draft,f.frozen_at
   from agent_run r join agent_skill_acceptance_freeze f on f.id=(r.execution_spec->>'freezeId')::uuid and f.owner_id=r.user_id
   where r.id=$1 and r.user_id=$2 and r.lease_token=$3 and r.status='running' and r.control is null
    and r.lease_until>clock_timestamp() and r.execution_kind='main-agent-evaluation'
    and r.execution_spec->>'schema'='skill-candidate-task-v1'`,[context.runId,context.userId,context.leaseToken])).rows[0];
  if(!row)throw new Error('Skill runtime task context unavailable');
  const spec=skillCandidateTaskSpecSchema.parse(row.execution_spec),plan=skillAcceptancePlanSchema.parse({...row.plan_draft,frozenAt:row.frozen_at.toISOString()});
  if(digest(spec)!==context.skillTaskSpecHash||digest(plan)!==spec.planHash)throw new Error('Skill runtime task context binding changed');
  return {spec,plan};
 });
 const {spec,plan}=saved;
 return assertSkillCandidateRuntimeTask(context,{runId:spec.originalRunId,skillId:spec.skillId,version:spec.version,freezeId:spec.freezeId,
  caseId:spec.caseId,evaluationId:spec.evaluationId,arm:spec.arm},plan);
}

/** Same owning application transaction for task settlement and source rebuild.
 * A failed result write rolls back without discarding independent model receipts. */
export async function settleSkillCandidateRuntimeTask(context:ExecutionContext,input:Selection,expectedPlan:unknown,status:'completed'|'partial',reply:string){
 return withPreparedTask(context,input,expectedPlan,async prepared=>{
  await assertSkillCandidateRuntimeTask(context,input,expectedPlan);
  const settled=await finishRun(context,status,reply);
  await withPreparedTask(context,input,expectedPlan,async after=>{
   if(digest(after.spec)!==digest(prepared.spec))throw new Error('Skill runtime sources changed during settlement');
  });
  return settled;
 });
}

/** Read-only admission for a completed hidden task. A stored runner flag is not
 * accepted as proof; rebuild the same source, scope and frozen-plan binding. */
export async function readCompletedSkillCandidateRuntimeTask(context:{userId:string},input:Selection&{taskId:string},expectedPlan:unknown){
 const {taskId,...pin}=input;z.uuid().parse(taskId);
 return withPreparedTask(context,pin,expectedPlan,async prepared=>tenantTransaction(context.userId,async client=>{
  const row=(await client.query<{result:unknown;completed_at:string}>(`select result,updated_at::text completed_at from agent_run
   where id=$1 and user_id=$2 and status='completed' and control is null and execution_kind='main-agent-evaluation'
    and execution_spec=$3::jsonb and input=$4::jsonb and model_config=$5::jsonb`,
  [taskId,context.userId,JSON.stringify(prepared.spec),JSON.stringify(prepared.input),JSON.stringify(prepared.model)])).rows[0];
  if(!row)throw new Error('Completed Skill runtime task unavailable or changed');
  return {taskId,spec:prepared.spec,specHash:digest(prepared.spec),reply:z.object({reply:z.string()}).strict().parse(row.result).reply,
   completedAt:row.completed_at,role:prepared.role,mode:prepared.input.mode,knowledgeScope:prepared.originalKnowledgeScope};
 }));
}
