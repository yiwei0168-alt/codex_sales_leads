import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {tenantQuery,tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {instructionOnlySkill} from './skills';
import {skillSourcesCurrent,type SourcedSkillVersion} from './skill-source-guard';
import {prepareHistoricalSkillReplay,type historicalSkillReplayInput} from './skill-replay-snapshot';
import {localReplayModel} from './skill-replay-local';
import {runGraphSkillReplay,SKILL_GRAPH_REPLAY_CONFIG} from './skill-graph-replay';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const SHADOW_MODEL_DIGEST='500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41';
const readTools=z.enum(['knowledge_search','knowledge_compare','vectorless_read','mail_read','customer_timeline']);
export const shadowSelectionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('whole-read-only-task')}).strict(),
 z.object({kind:z.literal('read-only-subtask'),objective:z.string().trim().min(10).max(4000),
  tools:z.array(readTools).min(1).max(5).refine(t=>new Set(t).size===t.length)}).strict(),
]);
export const shadowConfigSchema=z.object({protocol:z.literal('prospective-local-shadow-v1'),runtimeHash:sha,
 model:z.literal('qwen3:8b'),modelDigest:z.literal(SHADOW_MODEL_DIGEST),selection:shadowSelectionSchema,
 maximumModelCalls:z.literal(16),maximumAgeSeconds:z.literal(1800),automaticActivation:z.literal(false)}).strict();

/** Operator/worker fingerprint; never reads environment files or private corpus. */
export async function shadowRuntimeHash(){
 const files=['src/lib/assistant/main/skill-shadow.ts','src/lib/assistant/main/skill-replay-snapshot.ts',
  'src/lib/assistant/main/skill-replay.ts','src/lib/assistant/main/skill-replay-local.ts','src/lib/assistant/main/skill-replay-errors.ts',
  'src/lib/assistant/main/skill-graph-replay.ts','src/lib/assistant/main/graph.ts','src/lib/assistant/main/product.ts',
  'src/lib/assistant/main/tools.ts','src/lib/assistant/main/model.ts','src/lib/assistant/main/skill-source-guard.ts',
  'src/lib/assistant/main/private-replay-guard.ts','src/lib/assistant/main/knowledge-message-guard.ts',
  'src/lib/mailbox/repository.ts','src/lib/mailbox/customer-timeline.ts','package-lock.json'];
 return digest({files:Object.fromEntries(await Promise.all(files.map(async file=>[file,digest(await readFile(file,'utf8'))]))),config:SKILL_GRAPH_REPLAY_CONFIG});
}
export const shadowRegistrationSchema=z.object({skillId:z.uuid(),version:z.number().int().positive(),
 selection:shadowSelectionSchema,hours:z.number().int().min(1).max(24).default(1)}).strict();
export async function prepareShadowRegistration(userId:string,input:z.infer<typeof shadowRegistrationSchema>){
 z.uuid().parse(userId);const p=shadowRegistrationSchema.parse(input);
 const version=await tenantTransaction(userId,async client=>{
  const v=(await client.query<SourcedSkillVersion&{dependencies:unknown;current_version:number}>(`select s.scope,s.owner_id,s.current_version,
    v.source,v.validation,v.files,v.content_hash,v.dependencies from agent_skill s join agent_skill_version v on v.skill_id=s.id
    join app_user u on u.id=s.owner_id and u.status='active' where s.id=$1 and s.owner_id=$2 and v.version=$3`,[p.skillId,userId,p.version])).rows[0];
  if(!v||v.scope!=='account'||v.current_version!==p.version||!instructionOnlySkill(v.files)||digest(v.files)!==v.content_hash
   ||Object.values(v.files as Record<string,string>).reduce((n,s)=>n+s.length,0)>24000
   ||!Array.isArray(v.dependencies)||v.dependencies.length||!await skillSourcesCurrent(client,userId,v))throw new Error('Shadow Skill unavailable');
  return v;
 });
 return {ownerId:userId,skillId:p.skillId,version:p.version,contentHash:version.content_hash,
  sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies}),hours:p.hours,
  config:shadowConfigSchema.parse({protocol:'prospective-local-shadow-v1',runtimeHash:await shadowRuntimeHash(),model:'qwen3:8b',
   modelDigest:SHADOW_MODEL_DIGEST,selection:p.selection,maximumModelCalls:16,maximumAgeSeconds:1800,automaticActivation:false})};
}
type Context={userId:string;jobId:string;leaseToken?:string};
type Job={id:string;run_id:string;campaign_id:string;state:string;lease_token:string|null;lease_valid:boolean;ready_at:Date;
 start_context:Record<string,unknown>;final_context:Record<string,unknown>;current_context:unknown;
 config:unknown;content_hash:string;source_hash:string;version:number;skill_id:string;current_version:number;
 reply:unknown;instructions:unknown;files:unknown;dependencies:unknown;source:string;validation:unknown;scope:string;owner_id:string};

/** All provenance comes from pre-task server capture. The paired local analysis remains explicitly non-equivalent to production. */
export async function prepareSkillShadow(context:Context){
 z.uuid().parse(context.userId);z.uuid().parse(context.jobId);
 const job=await tenantTransaction(context.userId,async client=>{
  const row=(await client.query<Job>(`select j.*,j.lease_until>now() as lease_valid,
   c.config,c.content_hash,c.source_hash,c.version,c.skill_id,s.current_version,s.scope,s.owner_id,
   v.files,v.dependencies,v.source,v.validation,r.result as reply,r.instructions,
   skill_shadow_run_context(j.owner_id,j.run_id) as current_context
   from agent_skill_shadow_job j join agent_skill_shadow_campaign c on c.id=j.campaign_id and c.owner_id=j.owner_id
   join agent_skill s on s.id=c.skill_id and s.owner_id=j.owner_id
   join agent_skill_version v on v.skill_id=s.id and v.version=c.version
   join agent_run r on r.id=j.run_id and r.user_id=j.owner_id
   join app_user u on u.id=j.owner_id and u.status='active'
   where j.id=$1 and j.owner_id=$2 and c.enabled and c.expires_at>now() and r.status='completed'
     and r.execution_kind='main-agent'`,[context.jobId,context.userId])).rows[0];
  if(!row||row.scope!=='account'||row.current_version!==row.version||digest(row.files)!==row.content_hash
   ||!instructionOnlySkill(row.files)||!Array.isArray(row.dependencies)||row.dependencies.length
   ||!await skillSourcesCurrent(client,context.userId,row as SourcedSkillVersion))throw new Error('Shadow source unavailable');
  if(context.leaseToken&&(row.state!=='running'||!row.lease_valid||row.lease_token!==context.leaseToken))throw new Error('Shadow lease lost');
  if(!row.current_context||digest(row.current_context)!==digest(row.final_context))throw new Error('Shadow original task changed');
  const start=row.start_context;
  if(start.kind!=='prospective-server-capture'||start.campaignId!==row.campaign_id||start.skillId!==row.skill_id||start.version!==row.version
   ||start.contentHash!==row.content_hash||start.sourceHash!==row.source_hash||digest(start.config)!==digest(row.config)
   ||start.inputHash!==row.final_context.inputHash||start.modelConfigHash!==row.final_context.modelConfigHash
   ||row.source_hash!==digest({source:row.source,validation:row.validation,dependencies:row.dependencies}))throw new Error('Shadow registration changed');
  // Historical snapshot question does not include subsequent instructions; never silently omit them.
  if(!Array.isArray(row.instructions)||row.instructions.length)throw new Error('Shadow task has unsupported extra instructions');
  return row;
 });
 const config=shadowConfigSchema.parse(job.config);
 if(await shadowRuntimeHash()!==config.runtimeHash)throw new Error('Shadow runtime changed');
 if(context.leaseToken&&Date.now()-new Date(job.ready_at).getTime()>config.maximumAgeSeconds*1000)throw new Error('Shadow task too old');
 const input:z.infer<typeof historicalSkillReplayInput>={skillId:job.skill_id,version:job.version,runIds:[job.run_id]};
 if(config.selection.kind==='read-only-subtask'){
  const tools=config.selection.tools;
  const receipts=await tenantQuery<{id:string}>(context.userId,`select id from agent_tool_call where user_id=$1 and run_id=$2
   and tool_id=any($3::text[]) and effect='read' and status='completed' order by created_at,id`,[context.userId,job.run_id,tools]);
  input.subtasks=[{runId:job.run_id,readCallIds:receipts.map(r=>r.id),objective:config.selection.objective}];
 }
 const snapshot=await prepareHistoricalSkillReplay({userId:context.userId},input);
 return {capture:{jobId:job.id,campaignId:job.campaign_id,runId:job.run_id,start:job.start_context,final:job.final_context},
  config,snapshot,observedProductionResult:job.reply,
  interpretation:'Prospectively captured task; asynchronous local paired analysis. Production result is a separate observation, not the local baseline.',
  productionAgentEquivalent:false as const,automaticActivation:false as const};
}

/** Internal account worker. No dispatcher, IMAP, cloud fallback or HTTP result-upload endpoint. */
export async function processNextSkillShadow(userId:string){
 z.uuid().parse(userId);
 const job=(await tenantQuery<{id:string;lease_token:string}>(userId,'select * from claim_skill_shadow_job()'))[0];
 if(!job)return {claimed:false};
 const context={userId,jobId:job.id,leaseToken:job.lease_token};
 let lost=false,beating=false,artifact:unknown=null,local:Awaited<ReturnType<typeof localReplayModel>>|undefined;
 const beat=async()=>{if(beating)return;beating=true;try{
  const row=(await tenantQuery<{ok:boolean}>(userId,'select heartbeat_skill_shadow_job($1,$2) as ok',[job.id,job.lease_token]))[0];
  if(!row?.ok)lost=true;
 }catch{lost=true;}finally{beating=false;}};
 const timer=setInterval(()=>{void beat();},20000);
 try{
  const original=await prepareSkillShadow(context),hash=digest(original);
  const validate=async()=>{if(lost||digest(await prepareSkillShadow(context))!==hash)throw new Error('Shadow sources or lease changed');};
  local=await localReplayModel(process.env.OLLAMA_LOCAL_URL||'http://127.0.0.1:11434',original.config.modelDigest);
  let callNumber=0;
  const record=async(n:number,phase:string,receipt:unknown)=>{
   const row=(await tenantQuery<{ok:boolean}>(userId,'select record_skill_shadow_model_call($1,$2,$3,$4,$5) as ok',
    [job.id,job.lease_token,n,phase,JSON.stringify(receipt)]))[0];
   if(!row?.ok)throw new Error('Shadow model receipt rejected');
  };
  const analysis=await runGraphSkillReplay(original.snapshot.suite,async messages=>{
   const n=++callNumber;if(n>original.config.maximumModelCalls)throw new Error('Shadow model limit');
   await record(n,'started',{inputHash:digest(messages)});
   let reply:unknown;
   try{reply=await local!.generateAgent(messages);}catch{
    await record(n,'failed',{reason:'local-model-error'});throw new Error('Shadow local model failed');
   }
   await record(n,'completed',{outputHash:digest(reply)});return reply;
  },validate);
  await validate();
  artifact={protocol:'prospective-local-shadow-result-v1',provenance:original,localAnalysis:analysis,
   automaticActivation:false,productionAgentEquivalent:false};
  const complete=analysis.pairs.every(p=>p.baseline.status==='completed'&&p.candidate.status==='completed'&&!p.baseline.stopReason&&!p.candidate.stopReason);
  const saved=(await tenantQuery<{ok:boolean}>(userId,'select finish_skill_shadow_job($1,$2,$3,$4,$5) as ok',
   [job.id,job.lease_token,complete?'completed':'failed',JSON.stringify(artifact),complete?'pending-semantic-review':'local-analysis-incomplete']))[0];
  if(!saved?.ok)throw new Error('Shadow completion rejected');
  return {claimed:true,jobId:job.id,status:complete?'completed':'failed',acceptance:false};
 }catch{
  const saved=(await tenantQuery<{ok:boolean}>(userId,"select finish_skill_shadow_job($1,$2,'failed',$3,$4) as ok",
   [job.id,job.lease_token,artifact?JSON.stringify(artifact):null,lost?'lease-lost':'source-runtime-or-local-model-unavailable']).catch(()=>[]))[0];
  return {claimed:true,jobId:job.id,status:saved?.ok?'failed':'lease-lost',acceptance:false};
 }finally{clearInterval(timer);if(local)await local.close();}
}
