import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {withSkillCandidateLease} from '../src/lib/assistant/main/skill-candidate-lease';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {prepareSkillCandidateCheckpoint,type SkillCandidateCheckpoint} from '../src/lib/assistant/main/skill-candidate-checkpoint';
import {digest} from '../src/lib/assistant/main/contracts';
import {readFile} from 'node:fs/promises';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';
import {prepareSkillCandidateGraphCheckpointer} from '../src/lib/assistant/main/skill-candidate-graph-checkpointer';

nextEnv.loadEnvConfig(process.cwd());assert.equal(process.env.MA24_DISPOSABLE_CANDIDATE_LEASE_CONTENTION,'1');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),evaluationId=randomUUID(),errors:string[]=[];
const transaction:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{
  await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
  const value=await work(client);await client.query('commit');return value;
 }catch(error){await client.query('rollback');const code=(error as {code?:unknown})?.code;if(typeof code==='string')errors.push(code);throw error;}
 finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic lease contention','member','active')",[owner,`${owner}@example.invalid`]);
 const args=[owner,evaluationId,'candidate'];
 const expiry=async()=>(await pool.query('select lease_until::text until from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0].until;
 await withSkillCandidateLease(transaction,{ownerId:owner,evaluationId,arm:'candidate',sourceKind:'synthetic-fixture'},async(check,token,signal)=>{
  const first=await expiry(),blocker=await pool.connect();
  try{
   await blocker.query('begin');await blocker.query('select execution_token from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3 for share',args);
   await new Promise(done=>setTimeout(done,21_000));
   assert(errors.includes('55P03'),'Actual NOWAIT renewal must encounter the held shared row lock');
   assert.equal(signal.aborted,false,'Transient checkpoint row lock must not cancel a still valid lease');
   assert.equal(await expiry(),first,'A contended renewal must not extend the database deadline');await check();
  }finally{await blocker.query('rollback');blocker.release();}
  const deadline=Date.now()+25_000;let renewed=false;
  while(Date.now()<deadline){
   renewed=(await pool.query("select lease_until>$4::timestamptz+interval '10 seconds' renewed from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3",[...args,first])).rows[0].renewed;
   if(renewed)break;await new Promise(done=>setTimeout(done,100));
  }
  assert(renewed,'Next normal heartbeat must confirm renewal after the checkpoint lock releases');assert.equal(signal.aborted,false);await check();
  const underRenewalLock=async<T>(work:()=>Promise<T>)=>{
   const held=await pool.connect();let operation:Promise<{value?:T;code?:string}>|undefined;
   try{
    await held.query('begin');await held.query('select execution_token from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3 for update',args);
    const pid=(await held.query('select pg_backend_pid() pid')).rows[0].pid;let settled=false;
    operation=work().then(value=>{settled=true;return {value};},error=>{settled=true;return {code:typeof error?.code==='string'?error.code:'unclassified'};});
    let blocked=false;
    for(let i=0;i<100;i++){
     blocked=(await pool.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) blocked',[pid])).rows[0].blocked;
     if(blocked||settled)break;await new Promise(done=>setTimeout(done,10));
    }
    await held.query('commit');const outcome=await operation;
    assert.equal(outcome.code,undefined,'A brief live renewal lock must not reject the checkpoint');assert(blocked,'Checkpoint did not wait for the actual renewal-style lock');
    return outcome.value!;
   }finally{await held.query('rollback');held.release();if(operation)await operation;}
  };
  const binding={ownerId:owner,evaluationId,arm:'candidate' as const,sourceKind:'synthetic-fixture' as const,snapshotHash:digest('Synthetic contention checkpoint source')};
  const store=await underRenewalLock(()=>prepareSkillCandidateCheckpoint(transaction,binding,token,check));assert(store);
  const payload:SkillCandidateCheckpoint={protocol:'skill-candidate-graph-checkpoint-v1',inputHash:digest('Synthetic contention input'),arm:'candidate',maximumModelCalls:8,
   state:{messages:[],pending:[],steps:0,status:'running',reply:'',seen:{},instructionIds:[],decisionRevision:0,policyRevision:''},
   calls:0,stopReason:null,candidateSkillUsed:false,described:[],seenCalls:[],trace:[]};
  await underRenewalLock(()=>store.save(payload));assert.deepEqual(await store.load(),payload);
  const before=(await pool.query('select revision,payload_hash from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0];
  const long=await pool.connect();let timed:Promise<string>|undefined;
  try{
   await long.query('begin');await long.query('select execution_token from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3 for update',args);
   const started=Date.now();timed=store.save(payload).then(()=>'',error=>typeof error?.code==='string'?error.code:'unclassified');
   const release=setTimeout(()=>{void long.query('rollback').catch(()=>{});},5000);
   try{assert.equal(await timed,'55P03');assert(Date.now()-started>=750&&Date.now()-started<4000,'Checkpoint lock wait must remain bounded near one second');}
   finally{clearTimeout(release);}
  }finally{await long.query('rollback');long.release();if(timed)await timed;}
  assert.deepEqual((await pool.query('select revision,payload_hash from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0],before);
  assert.equal(signal.aborted,false);await check();
 });
 assert.equal((await pool.query('select status from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0].status,'released');
 const changedId=randomUUID(),changedArgs=[owner,changedId,'candidate'],replacement='999999999999';
 await assert.rejects(withSkillCandidateLease(transaction,{ownerId:owner,evaluationId:changedId,arm:'candidate',sourceKind:'synthetic-fixture'},async(check,token)=>{
  const held=await pool.connect();let operation:Promise<string>|undefined;
  try{
   await held.query('begin');await held.query('update agent_skill_candidate_execution_lease set execution_token=$4 where owner_id=$1 and evaluation_id=$2 and arm=$3',[...changedArgs,replacement]);
   const pid=(await held.query('select pg_backend_pid() pid')).rows[0].pid;
   operation=prepareSkillCandidateCheckpoint(transaction,{ownerId:owner,evaluationId:changedId,arm:'candidate',sourceKind:'synthetic-fixture',snapshotHash:digest('Synthetic changed lease checkpoint')},token,check)
    .then(()=>'',error=>error instanceof Error?error.message:'unclassified');
   let blocked=false;
   for(let i=0;i<100;i++){
    blocked=(await pool.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) blocked',[pid])).rows[0].blocked;
    if(blocked)break;await new Promise(done=>setTimeout(done,10));
   }
   assert(blocked,'Delayed checkpoint claim must reach the held changing-token row');await held.query('commit');
   assert.match(await operation,/lease ownership changed/);
   assert.equal((await pool.query('select count(*)::int n from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2',[owner,changedId])).rows[0].n,0);
  }finally{await held.query('rollback');held.release();if(operation)await operation;}
  await check();
 }),/lease lost or controlled/);
 assert.equal((await pool.query('select execution_token from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3',changedArgs)).rows[0].execution_token,replacement);
 await pool.query(await readFile('db/migrations/170_skill_candidate_graph_checkpoint.sql','utf8'));
 const graphEvaluation=randomUUID();
 await withSkillCandidateLease(transaction,{ownerId:owner,evaluationId:graphEvaluation,arm:'candidate',sourceKind:'synthetic-fixture'},async(check,token)=>{
  const pin={ownerId:owner,evaluationId:graphEvaluation,arm:'candidate' as const,sourceKind:'synthetic-fixture' as const,snapshotHash:digest('Synthetic PostgresSaver backend')};
  const {checkpointer:saver,config}=await prepareSkillCandidateGraphCheckpointer(transaction,pin,token,check);
  const checkpoint=emptyCheckpoint();checkpoint.channel_values={evidence:'Synthetic protocol bytes'};checkpoint.channel_versions={evidence:1};
  const saved=await saver.put(config,checkpoint,{source:'input',step:0,parents:{}},checkpoint.channel_versions);
  await saver.putWrites(saved,[['result','Synthetic pending result']],'synthetic-task');
  const tuple=await saver.getTuple(saved);assert.equal(tuple?.checkpoint.channel_values.evidence,'Synthetic protocol bytes');
  assert.deepEqual(tuple?.pendingWrites,[['synthetic-task','result','Synthetic pending result']]);
  const resumed=await prepareSkillCandidateGraphCheckpointer(transaction,pin,token,check);
  assert.deepEqual((await resumed.checkpointer.getTuple(saved))?.checkpoint,tuple.checkpoint);
  const listed=[];for await(const row of saver.list(config))listed.push(row);assert.equal(listed.length,1);
  await assert.rejects(saver.getTuple({configurable:{thread_id:`main-agent:${owner}:${graphEvaluation}`}}),/identity changed/);
  await assert.rejects(saver.setup(),/installed by migration/);
  const peer=randomUUID();await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic checkpoint peer','member','active')",[peer,`${peer}@example.invalid`]);
  await transaction(peer,async client=>{
   for(const table of ['checkpoints','checkpoint_blobs','checkpoint_writes'])
    assert.equal((await client.query(`select count(*)::int n from skill_candidate_graph.${table}`)).rows[0].n,0);
  });
  await assert.rejects(transaction(peer,client=>client.query("insert into skill_candidate_graph.checkpoint_blobs(thread_id,channel,version,type,blob) values($1,'cross','1','json',null)",[config.configurable.thread_id])),error=>(error as {code?:string}).code==='42501');
  const appClient=await pool.connect();try{
   await appClient.query('begin');await appClient.query('set local role network_copilot_app');
   await assert.rejects(appClient.query('select count(*) from skill_candidate_graph.checkpoints'),error=>(error as {code?:string}).code==='42501');
  }finally{await appClient.query('rollback');appClient.release();}
  // The same retained transaction must roll back a blocked pending write.
  const held=await pool.connect();let attempt:Promise<unknown>|undefined;
  try{
   await held.query('begin');await held.query('lock table skill_candidate_graph.checkpoint_writes in share mode');
   attempt=saver.putWrites(saved,[['result','Must roll back']],'expired-task').then(()=>null,error=>error);
   // The common one-second lock budget rejects long blocking before expiry.
   const error=await attempt;assert.equal((error as {code?:string})?.code,'55P03');
  }finally{await held.query('rollback');held.release();if(attempt)await attempt;}
  assert.equal((await pool.query('select count(*)::int n from skill_candidate_graph.checkpoint_writes where thread_id=$1 and task_id=$2',[config.configurable.thread_id,'expired-task'])).rows[0].n,0);
 });
 console.log(JSON.stringify({candidateLeaseContentionDatabase:'passed',actualRenewalSql55P03Observed:true,sharedCheckpointLockDoesNotAbortLiveWork:true,
  contendedRenewalDoesNotExtendDeadline:true,nextNormalHeartbeatActuallyRenews:true,scopeReleased:true,
  checkpointClaimAndSaveWaitForBriefRenewalLock:true,checkpointLongLockBoundedAndPayloadUnchanged:true,
  changedTokenDuringWaitRejectsCheckpointClaim:true,newTokenNotOverwrittenByOldRelease:true,
  candidatePostgresSaverRoundTripAndPendingWrites:true,candidatePostgresSaverRestartReadback:true,candidateGraphCrossTenantReadWriteDenied:true,
  appRoleCannotReadCandidateGraph:true,candidateGraphLongLockWriteRolledBack:true,candidateRuntimeGraphEntryWired:false,
  leaseSeconds:90,heartbeatSeconds:20,actualModelCalls:0}));
}finally{await pool.end();}
