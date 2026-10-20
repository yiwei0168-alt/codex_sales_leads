import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,unlink} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool,PoolClient} from 'pg';
import {digest,type ExecutionContext} from '../../src/lib/assistant/main/contracts';
import {changeSkill,readSkill,listSkills,listSkillsPage} from '../../src/lib/assistant/main/skills';
import {assertCurrentSkillMessages,SkillContextChangedError} from '../../src/lib/assistant/main/skill-message-guard';
import {withBoundTenantTransaction} from '../../src/lib/rag/db';
import {lockSkillAcceptancePinnedMethods} from '../../src/lib/assistant/main/skill-pinned-method-locks';
import {captureSkillActivationSources} from '../../src/lib/assistant/main/skill-activation-sources';
import {skillAcceptanceRunIds} from '../../src/lib/assistant/main/skill-acceptance-run-locks';
import {skillActivationCurrent} from '../../src/lib/assistant/main/skill-activation-binding';
import {tenantTransaction} from '../../src/lib/rag/db';
import {captureSkillAcceptanceLedger} from '../../src/lib/assistant/main/skill-acceptance-ledger';
import {productNodeBuildOptions} from '../lib/product-node-build.mjs';
import {skillCommitFault} from '../lib/ma24-skill-commit-fault';
import {readLockedSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-store';
import {skillAcceptanceJudgmentSchema} from '../../src/lib/assistant/main/skill-acceptance-policy';

/** Disposable database only. The real producer must reject missing evidence.
 * SQL commit/rollback cases then replace ONLY that producer with an explicit
 * test double. No human judgment or production qualification is manufactured. */
export async function verifyFinalActivationDatabase(pool:Pool,owner:string,other:string,skillId:string,bundleId:string){
 assert.equal(process.env.MA24_DISPOSABLE_LOCKED_POLICY,'1');
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,3);
 await pool.query(await readFile('db/migrations/141_skill_runner_attestation.sql','utf8'));
 for(const migration of ['144_skill_task_origin_locks.sql','146_skill_model_freeze_serialization.sql','147_skill_timeline_source_locks.sql','150_skill_shadow_source_locks.sql','151_skill_pinned_method_source_locks.sql'])
  await pool.query(await readFile(`db/migrations/${migration}`,'utf8'));
 await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
 await pool.query(await readFile('db/migrations/159_skill_runtime_package_registration.sql','utf8'));
 await pool.query(await readFile('db/migrations/156_knowledge_asset_immutable_snapshot.sql','utf8'));
 await pool.query(await readFile('db/migrations/158_immutable_snapshot_orphan_lifecycle.sql','utf8'));
 const commitGuard=await readFile('db/migrations/160_skill_activation_commit_guard.sql','utf8');await pool.query(commitGuard);await pool.query(commitGuard);
 const lifecycle=await readFile('db/migrations/161_skill_activation_lifecycle.sql','utf8');await pool.query(lifecycle);await pool.query(lifecycle);
 const sourceFence=await readFile('db/migrations/162_skill_activation_source_fence.sql','utf8');await pool.query(sourceFence);await pool.query(sourceFence);
 const reviewGuard=await readFile('db/migrations/163_skill_acceptance_review_serialization.sql','utf8');await pool.query(reviewGuard);await pool.query(reviewGuard);
 const declarationGuard=await readFile('db/migrations/164_skill_runner_attestation_serialization.sql','utf8');await pool.query(declarationGuard);await pool.query(declarationGuard);
 const readinessGuard=await readFile('db/migrations/165_skill_activation_source_readiness.sql','utf8');await pool.query(readinessGuard);await pool.query(readinessGuard);
 // Explicitly unqualified synthetic registrations for the mocked component only.
 const packageRevisions:string[]=[];
 for(const purpose of ['runner-declaration','model-transport','task-model-transport']){
  const registration={protocol:'skill-runtime-package-registration-v1',binding:{keyId:'synthetic-component-only',purpose},
   inspection:{fixture:true,productionQualified:false},validUntil:new Date(Date.now()+3600000).toISOString()};
  packageRevisions.push(String((await pool.query('select register_skill_runtime_package($1,$2,$3,null) revision',
   [registration,digest(registration),randomUUID()])).rows[0].revision));
 }
 const registry={protocol:'skill-runner-trust-registry-v1',keys:[]};
 await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
 const priorMode=process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE='database';
 const action={id:skillId,version:1,operation:'enable' as const};
 const makeActor=async()=>{
  const conversation=randomUUID(),runId=randomUUID(),leaseToken=randomUUID(),callId=randomUUID();
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic activation transaction')",[conversation,owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind,lease_token,lease_until)
   values($1,$2,$3,$1::uuid::text,$4,'{}','{}','running','main-agent',$5,clock_timestamp()+interval '1 hour')`,[runId,owner,conversation,digest(action),leaseToken]);
  await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
   values($1,$2,$3,'synthetic-enable','skill_manage','v1',$4,$5,'reversible','started')`,[callId,owner,runId,digest(action),JSON.stringify(action)]);
  return {userId:owner,role:'member' as const,runId,leaseToken,callId,instructionIds:[]};
 };
 const inspect=async(actor:Awaited<ReturnType<typeof makeActor>>)=>(await pool.query(`select s.enabled,c.status,c.output,
  (select count(*)::int from agent_run_event e where e.user_id=$1 and e.run_id=$3 and kind='skill_activated') events
  from agent_skill s join agent_tool_call c on c.id=$2 and c.user_id=$1 where s.id=$4 and s.owner_id=$1`,[owner,actor.callId,actor.runId,skillId])).rows[0];
 const temporaryRoot=resolve('tmp'),directory=await mkdtemp(join(temporaryRoot,'skill-final-activation-'));
 assert(resolve(directory).startsWith(temporaryRoot+sep));
 const trigger=`activation_fixture_${randomUUID().replaceAll('-','')}`;
 try{
  const rejected=await makeActor();
  await assert.rejects(changeSkill(rejected,action),/gate unavailable/);
  assert.deepEqual(await inspect(rejected),{enabled:false,status:'started',output:null,events:0});
  await assert.rejects(changeSkill({...rejected,userId:other},action),/approval|unavailable/);
  const saved=(await pool.query('select plan,observations,raw_receipts from agent_skill_acceptance_bundle where id=$1',[bundleId])).rows[0];
  const artifact={sourceKind:'production-runner-pending-verification',plan:saved.plan,observations:saved.observations,rawReceipts:saved.raw_receipts},pending=randomUUID();
  await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
   values($1,$2,$3,1,$4,$5,$6,$7,$8)`,[pending,owner,skillId,artifact.sourceKind,JSON.stringify(artifact.plan),JSON.stringify(artifact.observations),JSON.stringify(artifact.rawReceipts),digest(artifact)]);
  await assert.rejects(changeSkill(rejected,action),/declaration unavailable/);
  assert.deepEqual(await inspect(rejected),{enabled:false,status:'started',output:null,events:0});
  // Deliberately unqualified component metadata. Created AFTER the source task,
  // never presented as a real prospective capture or successful model execution.
  const freezeId=artifact.rawReceipts.collector.freezeId,campaignId=randomUUID(),captureId=randomUUID(),attemptId=randomUUID();
  const componentRun=skillAcceptanceRunIds(artifact)[0];
  await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
   values($1,$2,$3,1,$4,$5,$6,true,clock_timestamp()+interval '1 hour')`,
  [campaignId,owner,skillId,artifact.plan.pin.contentHash,artifact.plan.pin.sourceHash,{fixture:'unqualified-ledger-component-only'}]);
  await pool.query('insert into agent_skill_shadow_job(id,owner_id,run_id,campaign_id,start_context) values($1,$2,$3,$4,$5)',
   [captureId,owner,componentRun,campaignId,{fixture:'post-task-negative-only-not-prospective-proof'}]);
  await pool.query(`insert into agent_skill_model_attempt(id,owner_id,evaluation_id,arm,step,route_index,source_kind,snapshot_hash,input,input_hash,freeze_id)
   values($1,$2,$3,'candidate',0,0,'synthetic-fixture',$4,'{}',$5,$6)`,[attemptId,owner,randomUUID(),digest('unqualified component'),digest({}),freezeId]);
  const sourceSnapshot=await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,()=>captureSkillActivationSources(client,owner,skillAcceptanceRunIds(artifact))));
  const sourceRunId=sourceSnapshot.activationSources[0].runId;
  const flags=['policyPassed','acceptanceLedgerRevalidated','activationSourcesRevalidated','trustRegistryLocked','sourceRevocationGuardsReady','collectorProvenanceVerified','productionAgentEquivalent','canonicalOriginalCoverageRequired','canonicalOriginalCoverageRevalidated',
   'runnerDeclarationRequired','runnerDeclarationRevalidated','transportReceiptsRequired','transportReceiptsRevalidated','signingEnrollmentCoverageRequired','signingEnrollmentCoverageRevalidated',
   'runtimePackagesRequired','runtimePackagesRegistered','runtimePackageBytesPairRevalidated','runtimeModuleFormatPairRevalidated','methodExperienceTimesRevalidated','decisionMemorySnapshotRevalidated',
   'memoryReceiptSourcesRevalidated','memoryTimeFenceRevalidated','privateReceiptSourcesRevalidated','lockedEvidencePolicyEvaluated','sourcePayloadsRevalidated','knowledgeSourcesLocked','decisionMemorySourcesLocked',
   'skillCatalogSourcesLocked','pinnedMethodSourcesLocked','taskOriginsLocked','taskJournalsLocked','prospectiveCaptureSourcesLocked','timelineSourcesLocked','mailReadSourcesLocked','attachmentMetadataLocked'];
  const mock=`import {captureSkillMemoryTimeFence} from './skill-memory-time-fence';
   import {captureSkillAcceptanceLedger} from './skill-acceptance-ledger';
   export async function evaluateLockedSkillAcceptanceReadiness(client,context,bundleId){
   const row=(await client.query('select artifact_hash,plan from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',[bundleId,context.userId])).rows[0];
   const now=(await client.query('select clock_timestamp() checked_at')).rows[0].checked_at;
   const fence=await captureSkillMemoryTimeFence(client,context.userId,[]);
   const ledger=await captureSkillAcceptanceLedger(client,context.userId,bundleId,row.artifact_hash);
   await client.query("select pg_advisory_xact_lock_shared(hashtextextended('skill-runtime-packages-v1',0))");
   const protectedSource=(await client.query('select pg_current_xact_id()::text transaction_id,skill_activation_sources_ready($1,$2,$3) ready',
    [bundleId,'${freezeId}',row.artifact_hash])).rows[0];
   if(protectedSource.ready!==true)throw new Error('Source protection component unavailable');
   return {...${JSON.stringify(Object.fromEntries(flags.map(key=>[key,true])))},artifactHash:row.artifact_hash,latestReviewHash:${JSON.stringify(digest([]))},
    sourceRevocationsLocked:false,sourceProtectionHash:'${digest('mock source preparation')}',sourceProtectionTransactionId:protectedSource.transaction_id,
    materialsHash:'${digest('mock materials')}',currentRuntimeIdentityHash:'${digest(artifact.plan.identity)}',trustRegistryHash:'${digest(registry)}',runtimePackageRegistrationHash:'${digest('mock package')}',
    runtimePackageRevisions:${JSON.stringify(packageRevisions)},...fence,...ledger,blockers:[],acceptanceTimeCheckedAt:now.toISOString(),acceptanceValidBefore:new Date(Math.min(
     now.getTime()+(process.env.MA24_ACTIVATION_EXPIRY==='1'?2000:3600000),fence.memoryTimeValidBefore?Date.parse(fence.memoryTimeValidBefore):Infinity,
     Date.parse(row.plan.expiresAt),
     ${JSON.stringify(sourceSnapshot.activationSourcesValidBefore)}?Date.parse(${JSON.stringify(sourceSnapshot.activationSourcesValidBefore)}):Infinity)).toISOString(),
     activationSources:${JSON.stringify(sourceSnapshot.activationSources)}};}`;
  const compiled=join(directory,'transaction.mjs');
  await build({...productNodeBuildOptions(),entryPoints:['scripts/fixtures/skill-final-activation-transaction-runner.ts'],outfile:compiled,
   plugins:[{name:'explicit-test-only-qualified-producer',setup(builder){builder.onLoad({filter:/skill-locked-materials\.ts$/},args=>({contents:mock,loader:'ts',resolveDir:dirname(args.path)}));}}]});
  const run=async(actor:Awaited<ReturnType<typeof makeActor>>,failure=false,expiry=false,commitDelay=false,bindingClear=false,commitDelaySeconds=2.1,lateWrite?:string,databaseUrl?:string)=>{
   const job=join(directory,'job.json');await writeFile(job,JSON.stringify({actor,action,failure,commitDelay,bindingClear,commitDelaySeconds,lateWrite}));
   const out=await new Promise<{code:number|null;output:string}>((accept,reject)=>{
    const child=spawn(process.execPath,[compiled,job],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,...databaseUrl?{DATABASE_URL:databaseUrl}:{},NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',
     MA24_DISPOSABLE_FINAL_ACTIVATION:'1',MA24_ACTIVATION_EXPIRY:expiry?'1':'0'}});let output='';
    child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>accept({code,output}));
   });
   assert.equal(out.code,0,'Disposable activation component failed');return JSON.parse(out.output.trim());
  };
  const retainSources=async(client:PoolClient,packages=true)=>{
   const {readLockedSkillRunnerTrustRegistry}=await import('../../src/lib/assistant/main/skill-runner-trust-registry-store');
   await readLockedSkillRunnerTrustRegistry(client,owner);
   await readLockedSkillAcceptanceEvidence(client,{userId:owner},pending);
   await captureSkillAcceptanceLedger(client,owner,pending,digest(artifact));
   if(packages)await client.query("select pg_advisory_xact_lock_shared(hashtextextended('skill-runtime-packages-v1',0))");
  };
  const sourceReady=(client:PoolClient)=>client.query<{ready:boolean}>('select skill_activation_sources_ready($1,$2,$3) ready',[pending,freezeId,digest(artifact)]);
  await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
   assert.equal((await sourceReady(client)).rows[0].ready,false);
   await retainSources(client,false);assert.equal((await sourceReady(client)).rows[0].ready,false);
   await client.query("select pg_advisory_xact_lock_shared(hashtextextended('skill-runtime-packages-v1',0))");
   assert.equal((await sourceReady(client)).rows[0].ready,true);
  }));
  const unprotected=await makeActor();
  await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,()=>client.query(
   'select begin_skill_activation_source_fence($1,$2,$3,$4,$5,$6,$7,$8)',
   [unprotected.runId,unprotected.callId,skillId,1,pending,digest('unprotected seal component'),artifact.plan.expiresAt,unprotected.leaseToken]))),/source protection not ready/);
  assert.deepEqual(await inspect(unprotected),{enabled:false,status:'started',output:null,events:0});
  await pool.query('alter table agent_memory disable trigger skill_memory_source_statement');
  try{
   const disabled=await makeActor();assert.equal((await run(disabled,true)).activationReturnedBeforeCommit,false);
   assert.deepEqual(await inspect(disabled),{enabled:false,status:'started',output:null,events:0});
   await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
    await retainSources(client);
    return client.query('select begin_skill_activation_source_fence($1,$2,$3,$4,$5,$6,$7,$8)',
     [disabled.runId,disabled.callId,skillId,1,pending,digest('disabled legacy source guard'),artifact.plan.expiresAt,disabled.leaseToken]);
   })),/source protection not ready/);
  }finally{await pool.query('alter table agent_memory enable trigger skill_memory_source_statement');}
  await pool.query('alter table agent_memory disable trigger skill_activation_source_write');
  try{
   const disabled=await makeActor(),outcome=await run(disabled,true);
   assert.equal(outcome.activationReturnedBeforeCommit,false);
   assert.deepEqual(await inspect(disabled),{enabled:false,status:'started',output:null,events:0});
  }finally{await pool.query('alter table agent_memory enable trigger skill_activation_source_write');}
  await pool.query('alter table agent_skill_acceptance_judgment disable trigger skill_acceptance_judgment_admission');
  try{
   const disabled=await makeActor();
   assert.equal((await run(disabled,true)).activationReturnedBeforeCommit,false);
   assert.deepEqual(await inspect(disabled),{enabled:false,status:'started',output:null,events:0});
   await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,()=>client.query(
    'select begin_skill_activation_source_fence($1,$2,$3,$4,$5,$6,$7,$8)',
    [disabled.runId,disabled.callId,skillId,1,pending,digest('disabled review guard component'),artifact.plan.expiresAt,disabled.leaseToken]))),/review source guard unavailable/);
  }finally{await pool.query('alter table agent_skill_acceptance_judgment enable trigger skill_acceptance_judgment_admission');}
  await pool.query('alter table agent_skill_runner_attestation disable trigger skill_runner_attestation_admission');
  try{
   const disabled=await makeActor();
   assert.equal((await run(disabled,true)).activationReturnedBeforeCommit,false);
   assert.deepEqual(await inspect(disabled),{enabled:false,status:'started',output:null,events:0});
   await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,()=>client.query(
    'select begin_skill_activation_source_fence($1,$2,$3,$4,$5,$6,$7,$8)',
    [disabled.runId,disabled.callId,skillId,1,pending,digest('disabled declaration guard component'),artifact.plan.expiresAt,disabled.leaseToken]))),/declaration source guard unavailable/);
  }finally{await pool.query('alter table agent_skill_runner_attestation enable trigger skill_runner_attestation_admission');}
  const truncateClient=await pool.connect();
  try{for(const sql of ['truncate agent_skill_acceptance_judgment','truncate agent_skill_acceptance_bundle cascade','truncate agent_skill_runner_attestation']){
   await truncateClient.query('begin');
   try{await assert.rejects(truncateClient.query(sql),/append-only/);}finally{await truncateClient.query('rollback');}
  }}finally{truncateClient.release();}
  for(const sql of ['select * from skill_activation_source_fence','update skill_activation_source_fence set skill_written=false','delete from skill_activation_source_fence'])
   await assert.rejects(tenantTransaction(owner,client=>client.query(sql)),/permission denied/);
  const incomplete=await makeActor();
  await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{await retainSources(client);return client.query(
   'select begin_skill_activation_source_fence($1,$2,$3,$4,$5,$6,$7,$8)',
   [incomplete.runId,incomplete.callId,skillId,1,pending,digest('incomplete component fence'),artifact.plan.expiresAt,incomplete.leaseToken]);})),/source fence incomplete or expired at commit/);
  assert.deepEqual(await inspect(incomplete),{enabled:false,status:'started',output:null,events:0});
  const committed=await makeActor(),first=await run(committed),state=await inspect(committed);
  assert.equal(state.enabled,true);assert.equal(state.status,'completed');assert.equal(state.events,1);assert.equal(state.output.data.activationProofHash,first.data.activationProofHash);
  const metrics=(await pool.query('select metrics from agent_tool_call where id=$1',[committed.callId])).rows[0].metrics;
  assert.equal(metrics.costState,'known');assert.equal(metrics.apiCredits,0);assert.equal(metrics.costUsd,0);
  const binding=(await pool.query('select activation_binding from agent_skill where id=$1',[skillId])).rows[0].activation_binding;
  assert.equal(binding.callId,committed.callId);assert.deepEqual(binding.runtimePackageRevisions,packageRevisions);
  assert.equal(binding.runtimeHash,artifact.plan.identity.runtimeHash);
  const sealedAudit=(await pool.query("select payload from agent_run_event where user_id=$1 and run_id=$2 and kind='skill_activated'",[owner,committed.runId])).rows[0].payload;
  assert.equal(sealedAudit.sourceRevocationsLocked,true);assert.equal(sealedAudit.sourceProtectionHash,digest('mock source preparation'));
  const probeBlocked=async(sql:string,params:unknown[],writerRole?:'network_copilot_app'|'network_copilot_skill_collector')=>{
   const holder=await pool.connect(),writer=await pool.connect();let mutation:Promise<unknown>|undefined;
   try{
    await holder.query('begin');await holder.query('set local role network_copilot_app');
    await holder.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
    const snapshot=await withBoundTenantTransaction(holder,owner,async()=>{
     await readLockedSkillAcceptanceEvidence(holder,{userId:owner},pending.toUpperCase());
     return captureSkillAcceptanceLedger(holder,owner,pending.toUpperCase(),digest(artifact));
    });
    assert.equal(snapshot.acceptanceLedgerHash,binding.acceptanceLedgerHash);
    const holderPid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
    await writer.query('begin');
    if(writerRole){await writer.query(`set local role ${writerRole}`);
     await writer.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);}
    const writerPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
    mutation=writer.query(sql,params);void mutation.catch(()=>undefined);
    let blocked=false;
    for(let attempt=0;attempt<100;attempt++){
     blocked=(await pool.query('select $1::int=any(pg_blocking_pids($2::int)) blocked',[holderPid,writerPid])).rows[0].blocked;
     if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(blocked,true,'Ledger mutation must wait for the retained source transaction');
    if(writerRole)assert.equal((await pool.query("select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) waiting",[writerPid])).rows[0].waiting,true);
   }finally{
    try{await holder.query('rollback');holder.release();if(mutation){const effect=await mutation as {rowCount:number};if(writerRole)assert.equal(effect.rowCount,1);}}
    finally{await writer.query('rollback');writer.release();}
   }
  };
  await probeBlocked(`insert into agent_skill_model_attempt(owner_id,evaluation_id,arm,step,route_index,source_kind,snapshot_hash,input,input_hash,freeze_id)
   values($1,$2,'candidate',0,0,'synthetic-fixture',$3,'{}',$4,$5)`,[owner,randomUUID(),digest('blocked component append'),digest({}),freezeId]);
  await probeBlocked('update agent_skill_shadow_campaign set enabled=false where id=$1',[campaignId]);
  const reviewCase=artifact.observations[0];
  const revision=Number((await pool.query('select coalesce(max(revision),0)+1 revision from agent_skill_acceptance_judgment where owner_id=$1 and bundle_id=$2 and case_id=$3',
   [owner,pending,reviewCase.caseId])).rows[0].revision);
  const verdict={answer:false,citation:false,permission:false,injection:false};
  const syntheticReview=skillAcceptanceJudgmentSchema.parse({caseId:reviewCase.caseId,observationHash:digest(reviewCase),reviewerId:owner,
   kind:'assistant-development',revision,revoked:true,baseline:verdict,candidate:verdict,rationale:'Synthetic concurrent raw-DML rejection component; not a human approval.'});
  await probeBlocked(`insert into agent_skill_acceptance_judgment(owner_id,bundle_id,case_id,revision,reviewer_id,reviewer_kind,observation_hash,judgment)
   values($1,$2,$3,$4,$1,'assistant-development',$5,$6)`,[owner,pending,reviewCase.caseId,revision,digest(reviewCase),syntheticReview],'network_copilot_app');
  assert.equal(Number((await pool.query('select count(*) from agent_skill_acceptance_judgment where owner_id=$1 and bundle_id=$2 and case_id=$3 and revision=$4',
   [owner,pending,reviewCase.caseId,revision])).rows[0].count),0);
  const unsignedStatement={ownerId:owner,freezeId,artifactHash:digest(artifact),fixture:'unsigned append serialization only',nonce:randomUUID()};
  await probeBlocked(`insert into agent_skill_runner_attestation(owner_id,bundle_id,freeze_id,artifact_hash,statement_hash,envelope)
   values($1,$2,$3,$4,$5,$6)`,[owner,pending,freezeId,digest(artifact),digest(unsignedStatement),{statement:unsignedStatement,signature:'unqualified-component-only'}],'network_copilot_skill_collector');
  assert.equal(Number((await pool.query('select count(*) from agent_skill_runner_attestation where owner_id=$1 and bundle_id=$2 and statement_hash=$3',
   [owner,pending,digest(unsignedStatement)])).rows[0].count),0);
  // Each mutation is rolled back. Never append a human approval or leave a
  // withdrawn fixture frozen for the later acceptance cases in this same DB.
  const lifecycleClient=await pool.connect();
  try{
   const current=async()=>{
    await lifecycleClient.query('set local role network_copilot_app');
    await lifecycleClient.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
    try{
     const valid=await skillActivationCurrent(lifecycleClient,owner,skillId,1,binding);
     await withBoundTenantTransaction(lifecycleClient,owner,async()=>{
      const selected=await readSkill(committed as ExecutionContext,skillId);
      assert.equal(selected!==null,valid,'actual skill_read follows qualification');
      if(selected){assert.equal('activation_binding' in selected,false);assert.equal(selected.activation_binding_hash,digest(binding));}
      const listed=await listSkills(owner),page=await listSkillsPage(owner,0);
      assert.equal(listed.find(row=>row.id===skillId)?.enabled,valid,'model list follows qualification');
      assert.equal(page.items.find(row=>row.id===skillId)?.enabled,valid,'UI list follows qualification');
      if(valid)await assertCurrentSkillMessages(committed,[]);
      else await assert.rejects(assertCurrentSkillMessages(committed,[]),SkillContextChangedError);
      const dependentArtifact={plan:{cases:[{id:'dependent',provenance:'historical-task'}]},rawReceipts:{
       baselineSources:{dependent:{runId:committed.runId}},candidateSources:{dependent:{runId:committed.runId}}}};
      const checkDependency=()=>lockSkillAcceptancePinnedMethods(lifecycleClient,owner,dependentArtifact);
      if(valid)assert.equal((await checkDependency()).pinnedMethodVersionCount,1);
      else await assert.rejects(checkDependency(),/activation qualification changed/);
     });
     return valid;
    }
    finally{await lifecycleClient.query('reset role');}
   };
   // Actual separate backends: qualification retains operator admission gates
   // until TX end, and an in-flight operator makes new use fail without waiting.
   for(const gate of ['skill-runner-trust-registry-v1','skill-runtime-packages-v1']){
    const operator=await pool.connect();
    try{
     await lifecycleClient.query('begin');await operator.query('begin');
     assert.equal(await current(),true);
     const exclusive=async()=> (await operator.query('select pg_try_advisory_xact_lock(hashtextextended($1::text,0)) admitted',[gate])).rows[0].admitted;
     assert.equal(await exclusive(),false,`${gate}: current use retains gate`);
     await lifecycleClient.query('rollback');
     assert.equal(await exclusive(),true,`${gate}: transaction end releases gate`);
     await lifecycleClient.query('begin');
     await lifecycleClient.query('set local role network_copilot_app');
     await lifecycleClient.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
     await lifecycleClient.query("set local statement_timeout='3s'");
     assert.equal(await skillActivationCurrent(lifecycleClient,owner,skillId,1,binding),false,`${gate}: busy gate denies without waiting`);
     await lifecycleClient.query('rollback');await operator.query('rollback');
     await lifecycleClient.query('begin');assert.equal(await current(),true,`${gate}: operator rollback restores eligibility`);
    }finally{
     await lifecycleClient.query('rollback');await operator.query('rollback');operator.release();
    }
   }
   for(const isolation of ['repeatable read','serializable']){
    await lifecycleClient.query(`begin isolation level ${isolation}`);
    try{
     await lifecycleClient.query('set local role network_copilot_app');
     await lifecycleClient.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
     assert.equal(await skillActivationCurrent(lifecycleClient,owner,skillId,1,binding),false,`${isolation}: stale snapshots cannot qualify`);
    }finally{await lifecycleClient.query('rollback');}
   }
   const mutations:Array<[string,()=>Promise<unknown>]>=[
    ['registry',()=>lifecycleClient.query('select publish_skill_runner_trust_registry($1,$2)',[{...registry,fixtureChange:true},digest('changed synthetic registry')])],
    ['freeze',()=>lifecycleClient.query("insert into agent_skill_acceptance_freeze_revocation(freeze_id,owner_id,reason) values($1,$2,'Synthetic lifecycle withdrawal')",[binding.freezeId,owner])],
    ['package',()=>lifecycleClient.query("select withdraw_skill_runtime_package($1,$2,'Synthetic lifecycle withdrawal')",[randomUUID(),packageRevisions[0]])],
    ['package-superseded',async()=>{
     const previous=(await lifecycleClient.query('select registration from skill_runtime_package_registration where revision=$1',[packageRevisions[0]])).rows[0].registration;
     return lifecycleClient.query('select register_skill_runtime_package($1,$2,$3,$4)',[previous,digest(previous),randomUUID(),packageRevisions[0]]);
    }],
    ['review',()=>lifecycleClient.query(`insert into agent_skill_acceptance_judgment(bundle_id,owner_id,case_id,revision,reviewer_id,reviewer_kind,observation_hash,judgment)
     values($1,$2,'synthetic-lifecycle',1,$2,'assistant-development',$3,$4)`,[pending,owner,digest('synthetic observation'),
      {caseId:'synthetic-lifecycle',revision:1,reviewerId:owner,kind:'assistant-development',observationHash:digest('synthetic observation')}])],
    ['expiry',()=>lifecycleClient.query("update agent_skill set activation_binding=jsonb_set(activation_binding,'{validBefore}',to_jsonb((clock_timestamp()-interval '1 second')::text)) where id=$1",[skillId])],
    ['source-task',()=>lifecycleClient.query("update agent_run set status='failed' where user_id=$1 and id=$2",[owner,sourceRunId])],
    ['source-conversation',()=>lifecycleClient.query("update assistant_conversation set status='archived' where user_id=$1 and id=(select conversation_id from agent_run where id=$2 and user_id=$1)",[owner,sourceRunId])],
    ['source-message',()=>lifecycleClient.query("update assistant_message set content='Synthetic withdrawn original' where user_id=$1 and metadata->>'runId'=$2 and role='user'",[owner,sourceRunId])],
    ['source-current-memory',async()=>{
     const memoryId=randomUUID();await lifecycleClient.query(`insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind)
      values($1,$2,'account','preference',$1::uuid::text,'explicit')`,[memoryId,owner]);
     return lifecycleClient.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic changed source context','{}')",[memoryId]);
    }],
    ['evaluation-append',()=>lifecycleClient.query(`insert into agent_skill_model_attempt(owner_id,evaluation_id,arm,step,route_index,source_kind,snapshot_hash,input,input_hash,freeze_id)
     values($1,$2,'candidate',0,0,'synthetic-fixture',$3,'{}',$4,$5)`,[owner,randomUUID(),digest('late component attempt'),digest({}),freezeId])],
    ['evaluation-outcome',()=>lifecycleClient.query('insert into agent_skill_model_outcome(attempt_id,owner_id,output,output_hash) values($1,$2,$3,$4)',
     [attemptId,owner,{fixture:'unqualified late outcome'},digest({fixture:'unqualified late outcome'})])],
    ['capture-start',()=>lifecycleClient.query("update agent_skill_shadow_job set start_context='{}' where id=$1",[captureId])],
    ['capture-final',()=>lifecycleClient.query("update agent_skill_shadow_job set final_context='{}' where id=$1",[captureId])],
    ['capture-ready',()=>lifecycleClient.query('update agent_skill_shadow_job set ready_at=clock_timestamp() where id=$1',[captureId])],
    ['capture-campaign',()=>lifecycleClient.query('update agent_skill_shadow_campaign set enabled=false where id=$1',[campaignId])],
    ['capture-config',()=>lifecycleClient.query("update agent_skill_shadow_campaign set config='{}' where id=$1",[campaignId])],
    ['declaration-append',()=>{
     const statement={ownerId:owner,freezeId,artifactHash:digest(artifact)};
     return lifecycleClient.query(`insert into agent_skill_runner_attestation(owner_id,bundle_id,freeze_id,artifact_hash,statement_hash,envelope)
      values($1,$2,$3,$4,$5,$6)`,[owner,pending,freezeId,digest(artifact),digest(statement),{statement,signature:'unqualified-component-only'}]);
    }],
   ];
   const runtimeMarker=resolve('src',`.ma24-runtime-transition-${randomUUID()}.json`);
   assert(runtimeMarker.startsWith(resolve('src')+sep));
   await lifecycleClient.query('begin');
   try{
    assert.equal(await current(),true);
    await writeFile(runtimeMarker,JSON.stringify({syntheticRuntimeTransition:true}),{flag:'wx'});
    try{assert.equal(await current(),false,'Actual source inventory change must invalidate bound Skill');}
    finally{await unlink(runtimeMarker);}
    assert.equal(await current(),true,'Restoring identical runtime bytes restores component eligibility');
   }finally{await lifecycleClient.query('rollback');}
   for(const [name,mutate] of mutations){
    await lifecycleClient.query('begin');
    try{assert.equal(await current(),true,`${name}: baseline current`);await mutate();assert.equal(await current(),false,`${name}: withdrawn qualification must deny`);}
    finally{await lifecycleClient.query('rollback');}
   }
   await lifecycleClient.query('begin');
   try{
    await lifecycleClient.query("update agent_skill_shadow_job set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '1 hour',result='{}' where id=$1",[captureId,randomUUID()]);
    assert.equal(await current(),true,'Unused local outcome and lease changes are not production evidence');
    await lifecycleClient.query(`insert into agent_skill_model_attempt(owner_id,evaluation_id,arm,step,route_index,source_kind,snapshot_hash,input,input_hash)
     values($1,$2,'candidate',0,0,'synthetic-fixture',$3,'{}',$4)`,[owner,randomUUID(),digest('unrelated freeze-less attempt'),digest({})]);
    assert.equal(await current(),true,'Unrelated evaluation family must not invalidate qualification');
   }finally{await lifecycleClient.query('rollback');}
  }finally{lifecycleClient.release();}
  await pool.query('update agent_skill set enabled=false where id=$1',[skillId]);
  assert.equal((await pool.query('select activation_binding from agent_skill where id=$1',[skillId])).rows[0].activation_binding,null);
  assert.deepEqual((await run(committed)).data,first.data);assert.equal((await inspect(committed)).enabled,false);assert.equal((await inspect(committed)).events,1);
  const fault=await skillCommitFault(process.env.DATABASE_URL!);
  let commitFaultStats:typeof fault.stats;
  try{
   const lostAck=await makeActor();fault.arm('after');
   assert.equal((await run(lostAck,true,false,false,false,2.1,undefined,fault.url)).activationTransaction,'rejected');
   const saved=await inspect(lostAck);
   assert.equal(saved.enabled,true);assert.equal(saved.status,'completed');assert.equal(saved.events,1);
   assert.equal(fault.stats.targetCommits,1);assert.equal(fault.stats.backendCommits,1);assert.equal(fault.stats.droppedCommitAcks,1);
   await pool.query('update agent_skill set enabled=false where id=$1',[skillId]);
   const reconciled=await run(lostAck,false,false,false,false,2.1,undefined,fault.url);
   assert.deepEqual(reconciled.data,saved.output.data);assert.equal((await inspect(lostAck)).enabled,false);assert.equal((await inspect(lostAck)).events,1);
   const notCommitted=await makeActor();fault.arm('before');
   assert.equal((await run(notCommitted,true,false,false,false,2.1,undefined,fault.url)).activationTransaction,'rejected');
   assert.deepEqual(await inspect(notCommitted),{enabled:false,status:'started',output:null,events:0});
   assert.equal(fault.stats.targetCommits,2);assert.equal(fault.stats.backendCommits,1);assert.equal(fault.stats.blockedCommits,1);
   const retried=await run(notCommitted,false,false,false,false,2.1,undefined,fault.url);
   const recovered=await inspect(notCommitted);
   assert.equal(recovered.enabled,true);assert.equal(recovered.status,'completed');assert.equal(recovered.events,1);assert.deepEqual(recovered.output.data,retried.data);
   assert.deepEqual((await run(notCommitted,false,false,false,false,2.1,undefined,fault.url)).data,retried.data);
   assert.equal((await inspect(notCommitted)).events,1);assert.equal(fault.stats.protocolFailures,0);
   commitFaultStats={...fault.stats};
   await pool.query('update agent_skill set enabled=false where id=$1',[skillId]);
  }finally{await fault.close();}
  const audit=await makeActor();
  await pool.query(`create function ${trigger}() returns trigger language plpgsql as $$ begin
   if new.run_id='${audit.runId}'::uuid and new.kind='skill_activated' then raise exception 'Activation fixture audit failure'; end if; return new; end $$;
   create trigger ${trigger} before insert on agent_run_event for each row execute function ${trigger}()`);
  assert.equal((await run(audit,true)).activationTransaction,'rejected');
  assert.deepEqual(await inspect(audit),{enabled:false,status:'started',output:null,events:0});
  await pool.query(`drop trigger ${trigger} on agent_run_event; drop function ${trigger}()`);
  const expired=await makeActor();
  await pool.query(`create function ${trigger}() returns trigger language plpgsql as $$ begin
   if new.id='${skillId}'::uuid and new.enabled then perform pg_sleep(2.1); end if; return new; end $$;
   create trigger ${trigger} before update on agent_skill for each row execute function ${trigger}()`);
  assert.equal((await run(expired,true,true)).activationTransaction,'rejected');
  assert.deepEqual(await inspect(expired),{enabled:false,status:'started',output:null,events:0});
  await pool.query(`drop trigger ${trigger} on agent_skill; drop function ${trigger}()`);
  const commitExpired=await makeActor();
  assert.equal((await run(commitExpired,true,true,true)).activationTransaction,'rejected');
  assert.deepEqual(await inspect(commitExpired),{enabled:false,status:'started',output:null,events:0});
  const bindingCleared=await makeActor();
  assert.equal((await run(bindingCleared,true,false,false,true)).activationTransaction,'rejected');
  assert.deepEqual(await inspect(bindingCleared),{enabled:false,status:'started',output:null,events:0});
  const customerId=randomUUID();
  await pool.query("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$1::uuid::text,'Synthetic late-write source')",[customerId,owner]);
  for(const lateWrite of ['memory','source-run','source-message','receipt','knowledge','mail','rearm','guc-reset','early-constraints','empty-source-write']){
   const actor=await makeActor(),outcome=await run(actor,true,false,false,false,2.1,lateWrite);
   assert.equal(outcome.activationReturnedBeforeCommit,true,lateWrite);assert.equal(outcome.sourceFenceRejected,true,lateWrite);
   assert.deepEqual(await inspect(actor),{enabled:false,status:'started',output:null,events:0});
  }
  // A real memory clock fence feeds the otherwise mocked qualification. No
  // source write occurs during activation; only wall-clock time advances.
  for(const boundary of ['expiry','activation']){
   const memoryId=randomUUID(),actor=await makeActor();
   await pool.query(`insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind,valid_from,valid_until)
    values($1,$2,'account','preference',$1::uuid::text,'explicit',
     case when $3='activation' then clock_timestamp()+interval '5 seconds' else '2000-01-01'::timestamptz end,
     case when $3='expiry' then clock_timestamp()+interval '5 seconds' else null end)`,[memoryId,owner,boundary]);
   await pool.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic temporal fence','{}')",[memoryId]);
   try{
    const outcome=await run(actor,true,false,true,false,5.2);
    assert.equal(outcome.activationTransaction,'rejected');assert.equal(outcome.activationReturnedBeforeCommit,true);
    assert.deepEqual(await inspect(actor),{enabled:false,status:'started',output:null,events:0});
   }finally{await pool.query('delete from agent_memory_version where memory_id=$1',[memoryId]);await pool.query('delete from agent_memory where id=$1',[memoryId]);}
  }
  assert.equal((await pool.query("select count(*)::int n from agent_skill_acceptance_judgment where reviewer_kind='human'")).rows[0].n,0);
  console.log(JSON.stringify({finalSkillActivationDatabase:'passed',realProducerSyntheticAndUnsignedRejected:true,foreignOwnerRejected:true,
   atomicSkillToolReceiptAndEventCommitted:true,committedReceiptReconciledWithoutReenable:true,auditFailureRollsBackAll:true,postWriteExpiryRollsBackAll:true,commitExpiryRollsBackAll:true,
   positiveQualificationProducerMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({skillActivationLifecycle:'passed',registryChangeDenied:true,freezeRevocationDenied:true,packageWithdrawalDenied:true,
   packageSupersessionDenied:true,reviewRevisionChangeDenied:true,expiredBindingDenied:true,manualDisableClearsBinding:true,
   actualReadAndModelListAndUiListAndPinnedGuard:true,dependentAcceptanceMethodInvalidation:true,bindingClearBeforeCommitRollsBack:true,qualificationProducerMocked:true,humanApprovalCreated:false}));
  console.log(JSON.stringify({activationBusinessSourceLifecycle:'passed',actualSourceSnapshots:true,sourceTaskRevocationDenied:true,
   sourceConversationArchiveDenied:true,sourceMessageChangeDenied:true,sourceDecisionMemoryChangeDenied:true,
   freshReadAndListsAndRunningAndDependentGuards:true,qualificationProducerMocked:true,humanApprovalCreated:false,modelCalls:0}));
  console.log(JSON.stringify({acceptanceLedgerLifecycle:'passed',sameFreezeAttemptAppendDenied:true,outcomeAppendDenied:true,
   captureStartFinalAndReadyChangeDenied:true,campaignDisableAndConfigChangeDenied:true,declarationAppendDenied:true,
   unusedLeaseAndLocalOutcomeIgnored:true,unrelatedEvaluationIgnored:true,appendAndCampaignWritesWaitForRetainedLocks:true,realLedgerProducer:true,qualificationProducerMocked:true,
   captureTimingAndModelQualityNotQualified:true,humanApprovalCreated:false,modelCalls:0}));
  console.log(JSON.stringify({memoryTimeCommitFence:'passed',actualDecisionMemoryExpiryCommitRejected:true,actualFutureMemoryActivationCommitRejected:true,
   activationReturnedBeforeCommit:true,sourceEditsDuringActivation:0,temporalFenceProducerReal:true,otherQualificationProducerMocked:true,humanApprovalCreated:false,modelCalls:0}));
  console.log(JSON.stringify({activationSourceTransactionFence:'passed',lateMemoryTaskMessageReceiptKnowledgeAndMailWritesRejected:true,
   rearmRejected:true,customGucResetCannotUnseal:true,earlyConstraintFlushCannotUnseal:true,emptySourceStatementRejected:true,allEffectsRolledBack:true,
   disabledSourceGuardRefusesArming:true,privateFenceSelectUpdateDeleteDenied:true,incompleteTupleCommitRejected:true,
   qualificationProducerMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({activationCommitOutcomes:'passed',actualPostgresWireFault:true,loopbackPlaintextOnly:true,
   committedTupleRetainedAfterLostAck:true,reconcileDoesNotReenable:true,unforwardedCommitRollsBackAll:true,explicitRetryCommitsOnce:true,
   automaticTransactionReplay:false,proxyStats:commitFaultStats,qualificationProducerMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({activationRuntimeLifecycle:'passed',actualFilesystemSourceInventoryChangeDenied:true,restoredRuntimeIdentityAccepted:true,
   actualReadAndListsAndRunningAndDependentGuards:true,qualificationProducerMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({activationReviewSerialization:'passed',rawApplicationJudgmentAppendWaitsForActualReader:true,
   writerCompletesAfterReaderEnds:true,syntheticReviewRolledBack:true,disabledGuardRejectsAdapterAndDirectSealing:true,
   bundleAndJudgmentTruncateRejected:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({activationDeclarationSerialization:'passed',rawCollectorAppendWaitsForActualReader:true,
   actualAdvisoryWaitVerified:true,uppercaseBundleReaderRetainsCanonicalGate:true,writerCompletesAfterReaderEnds:true,unsignedComponentAppendRolledBack:true,
   disabledGuardRejectsAdapterAndDirectSealing:true,declarationTruncateRejected:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({activationUseAdmission:'passed',actualSeparateBackends:true,trustAndPackageGatesRetainedUntilTransactionEnd:true,
   busyOperatorRefusesUseWithoutWaiting:true,operatorRollbackRestoresEligibility:true,repeatableReadAndSerializableDenied:true,
   qualificationProducerMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
  console.log(JSON.stringify({activationSourceReadiness:'passed',missingRetainedLocksRejected:true,missingPackageGateRejected:true,
   allRetainedGatesAccepted:true,disabledLegacyGuardRejectsProducerAndDirectSealing:true,unprotectedDirectSealingRejected:true,
   sealedAuditRequiresActualFence:true,positiveOtherQualificationMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
 }finally{
  await pool.query(`drop trigger if exists ${trigger} on agent_run_event; drop trigger if exists ${trigger} on agent_skill; drop function if exists ${trigger}()`);
  if(priorMode===undefined)delete process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;else process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE=priorMode;
  assert(resolve(directory).startsWith(temporaryRoot+sep));
  await rm(directory,{recursive:true,force:true});
 }
}
