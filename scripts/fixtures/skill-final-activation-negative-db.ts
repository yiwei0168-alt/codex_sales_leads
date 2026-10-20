import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {changeSkill} from '../../src/lib/assistant/main/skills';
import {productNodeBuildOptions} from '../lib/product-node-build.mjs';

/** Disposable database only. The real producer must reject missing evidence.
 * SQL commit/rollback cases then replace ONLY that producer with an explicit
 * test double. No human judgment or production qualification is manufactured. */
export async function verifyFinalActivationDatabase(pool:Pool,owner:string,other:string,skillId:string,bundleId:string){
 assert.equal(process.env.MA24_DISPOSABLE_LOCKED_POLICY,'1');
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,3);
 await pool.query(await readFile('db/migrations/141_skill_runner_attestation.sql','utf8'));
 await pool.query(await readFile('db/migrations/157_skill_runner_trust_registry.sql','utf8'));
 const commitGuard=await readFile('db/migrations/160_skill_activation_commit_guard.sql','utf8');await pool.query(commitGuard);await pool.query(commitGuard);
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
  const flags=['policyPassed','trustRegistryLocked','sourceRevocationsLocked','collectorProvenanceVerified','productionAgentEquivalent','canonicalOriginalCoverageRequired','canonicalOriginalCoverageRevalidated',
   'runnerDeclarationRequired','runnerDeclarationRevalidated','transportReceiptsRequired','transportReceiptsRevalidated','signingEnrollmentCoverageRequired','signingEnrollmentCoverageRevalidated',
   'runtimePackagesRequired','runtimePackagesRegistered','runtimePackageBytesPairRevalidated','runtimeModuleFormatPairRevalidated','methodExperienceTimesRevalidated','decisionMemorySnapshotRevalidated',
   'memoryReceiptSourcesRevalidated','privateReceiptSourcesRevalidated','lockedEvidencePolicyEvaluated','sourcePayloadsRevalidated','knowledgeSourcesLocked','decisionMemorySourcesLocked',
   'skillCatalogSourcesLocked','pinnedMethodSourcesLocked','taskOriginsLocked','taskJournalsLocked','prospectiveCaptureSourcesLocked','timelineSourcesLocked','mailReadSourcesLocked','attachmentMetadataLocked'];
  const mock=`export async function evaluateLockedSkillAcceptanceReadiness(client,context,bundleId){
   const row=(await client.query('select artifact_hash from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',[bundleId,context.userId])).rows[0];
   const now=(await client.query('select clock_timestamp() checked_at')).rows[0].checked_at;
   return {...${JSON.stringify(Object.fromEntries(flags.map(key=>[key,true])))},artifactHash:row.artifact_hash,latestReviewHash:${JSON.stringify(digest([]))},
    materialsHash:'${digest('mock materials')}',currentRuntimeIdentityHash:'${digest('mock runtime')}',trustRegistryHash:'${digest(registry)}',runtimePackageRegistrationHash:'${digest('mock package')}',
    blockers:[],acceptanceTimeCheckedAt:now.toISOString(),acceptanceValidBefore:new Date(now.getTime()+(process.env.MA24_ACTIVATION_EXPIRY==='1'?2000:3600000)).toISOString()};}`;
  const compiled=join(directory,'transaction.mjs');
  await build({...productNodeBuildOptions(),entryPoints:['scripts/fixtures/skill-final-activation-transaction-runner.ts'],outfile:compiled,
   plugins:[{name:'explicit-test-only-qualified-producer',setup(builder){builder.onLoad({filter:/skill-locked-materials\.ts$/},args=>({contents:mock,loader:'ts',resolveDir:dirname(args.path)}));}}]});
  const run=async(actor:Awaited<ReturnType<typeof makeActor>>,failure=false,expiry=false,commitDelay=false)=>{
   const job=join(directory,'job.json');await writeFile(job,JSON.stringify({actor,action,failure,commitDelay}));
   const out=await new Promise<{code:number|null;output:string}>((accept,reject)=>{
    const child=spawn(process.execPath,[compiled,job],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',
     MA24_DISPOSABLE_FINAL_ACTIVATION:'1',MA24_ACTIVATION_EXPIRY:expiry?'1':'0'}});let output='';
    child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>accept({code,output}));
   });
   assert.equal(out.code,0,'Disposable activation component failed');return JSON.parse(out.output.trim());
  };
  const committed=await makeActor(),first=await run(committed),state=await inspect(committed);
  assert.equal(state.enabled,true);assert.equal(state.status,'completed');assert.equal(state.events,1);assert.equal(state.output.data.activationProofHash,first.data.activationProofHash);
  const metrics=(await pool.query('select metrics from agent_tool_call where id=$1',[committed.callId])).rows[0].metrics;
  assert.equal(metrics.costState,'known');assert.equal(metrics.apiCredits,0);assert.equal(metrics.costUsd,0);
  await pool.query('update agent_skill set enabled=false where id=$1',[skillId]);
  assert.deepEqual((await run(committed)).data,first.data);assert.equal((await inspect(committed)).enabled,false);assert.equal((await inspect(committed)).events,1);
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
  assert.equal((await pool.query("select count(*)::int n from agent_skill_acceptance_judgment where reviewer_kind='human'")).rows[0].n,0);
  console.log(JSON.stringify({finalSkillActivationDatabase:'passed',realProducerSyntheticAndUnsignedRejected:true,foreignOwnerRejected:true,
   atomicSkillToolReceiptAndEventCommitted:true,committedReceiptReconciledWithoutReenable:true,auditFailureRollsBackAll:true,postWriteExpiryRollsBackAll:true,commitExpiryRollsBackAll:true,
   positiveQualificationProducerMocked:true,humanApprovalCreated:false,productionQualificationGranted:false,modelCalls:0}));
 }finally{
  await pool.query(`drop trigger if exists ${trigger} on agent_run_event; drop trigger if exists ${trigger} on agent_skill; drop function if exists ${trigger}()`);
  if(priorMode===undefined)delete process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;else process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE=priorMode;
  assert(resolve(directory).startsWith(temporaryRoot+sep));
  await rm(directory,{recursive:true,force:true});
 }
}
