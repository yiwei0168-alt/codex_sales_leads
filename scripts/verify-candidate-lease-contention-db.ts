import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {withSkillCandidateLease} from '../src/lib/assistant/main/skill-candidate-lease';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';

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
 await withSkillCandidateLease(transaction,{ownerId:owner,evaluationId,arm:'candidate',sourceKind:'synthetic-fixture'},async(check,_token,signal)=>{
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
 });
 assert.equal((await pool.query('select status from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0].status,'released');
 console.log(JSON.stringify({candidateLeaseContentionDatabase:'passed',actualRenewalSql55P03Observed:true,sharedCheckpointLockDoesNotAbortLiveWork:true,
  contendedRenewalDoesNotExtendDeadline:true,nextNormalHeartbeatActuallyRenews:true,scopeReleased:true,leaseSeconds:90,heartbeatSeconds:20,actualModelCalls:0}));
}finally{await pool.end();}
