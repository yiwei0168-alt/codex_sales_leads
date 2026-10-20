import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {withSkillCandidateLease} from '../../src/lib/assistant/main/skill-candidate-lease';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {freezeSkillAcceptancePlan} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function verifySkillCandidateLeaseDatabase(pool:Pool,owner:string,other:string,transaction:SkillCollectorTransaction,
 frozen:NonNullable<SkillCandidateCollector['frozen']>){
 const pin={ownerId:owner,evaluationId:randomUUID(),arm:'candidate' as const,sourceKind:'synthetic-fixture' as const};
 const args=[owner,pin.evaluationId,pin.arm];
 await assert.rejects(withSkillCandidateLease(transaction,pin,async(check,_token,signal)=>{
  let entered=false;
  await assert.rejects(withSkillCandidateLease(transaction,pin,async()=>{entered=true;}),/already owned or controlled/);assert.equal(entered,false);
  await withSkillCandidateLease(transaction,{...pin,arm:'baseline'},async current=>current());
  const first=(await pool.query('select lease_until from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0].lease_until;
  const until=Date.now()+26000;let renewed=false;
  while(Date.now()<until){
   await sleep(250);
   const row=(await pool.query('select lease_until from agent_skill_candidate_execution_lease where owner_id=$1 and evaluation_id=$2 and arm=$3',args)).rows[0];
   if(new Date(row.lease_until).getTime()>new Date(first).getTime()+10000){renewed=true;break;}
  }
  assert(renewed,'Actual 20-second heartbeat must extend the database lease');await check();
  await pool.query("update agent_skill_candidate_execution_lease set control='pause' where owner_id=$1 and evaluation_id=$2 and arm=$3",args);
  await assert.rejects(check(),/lease lost or controlled/);assert.equal(signal.aborted,true);
 }),/lease lost or controlled/);
 await assert.rejects(withSkillCandidateLease(transaction,pin,async()=>{}),/already owned or controlled/);
 await pool.query('update agent_skill_candidate_execution_lease set control=null where owner_id=$1 and evaluation_id=$2 and arm=$3',args);
 await withSkillCandidateLease(transaction,pin,async check=>check());

 // Cancellation is observed by the real heartbeat while callback work is idle.
 await assert.rejects(withSkillCandidateLease(transaction,pin,async(_check,_token,signal)=>{
  await pool.query("update agent_skill_candidate_execution_lease set control='cancel' where owner_id=$1 and evaluation_id=$2 and arm=$3",args);
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>{signal.removeEventListener('abort',done);reject(new Error('Heartbeat did not propagate cancellation'));},26000);
   const done=()=>{clearTimeout(timeout);resolve();};
   if(signal.aborted)done();else signal.addEventListener('abort',done,{once:true});
  });assert(signal.aborted);
 }),/lease lost or controlled/);
 await assert.rejects(withSkillCandidateLease(transaction,pin,async()=>{}),/already owned or controlled/);

 // A shorter declared run deadline reaches natural DB expiry without waiting
 // the full 90s default. The old callback intentionally remains alive.
 const clock=(await pool.query('select clock_timestamp() t')).rows[0].t;
 const short={...pin,evaluationId:randomUUID(),expiresAt:new Date(new Date(clock).getTime()+3000).toISOString()};
 let release!:()=>void,enter!:()=>void,oldToken:string|undefined;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
 const old=withSkillCandidateLease(transaction,short,async(_check,token)=>{oldToken=token;enter();await released;});
 const rejected=assert.rejects(old,/lease lost or controlled/);await entered;await pool.query('select pg_sleep(3.3)');
 await withSkillCandidateLease(transaction,{...short,expiresAt:undefined},async(check,token)=>{
  assert.notEqual(token,oldToken);release();await rejected;await check();
 });

 const {frozenAt:unused,...draft}=frozen.plan;void unused;
 const fresh=await freezeSkillAcceptancePlan({userId:owner},draft,transaction);
 const bound={...pin,evaluationId:randomUUID(),freezeId:fresh.freezeId,expiresAt:fresh.plan.expiresAt};
 await assert.rejects(withSkillCandidateLease(transaction,bound,async check=>{
  await pool.query("insert into agent_skill_acceptance_freeze_revocation(freeze_id,owner_id,reason) values($1,$2,'Synthetic lease revocation')",[fresh.freezeId,owner]);
  await check();
 }),/lease lost or controlled/);
 await assert.rejects(withSkillCandidateLease(transaction,bound,async()=>{}),/already owned or controlled/);
 await transaction(other,async client=>assert.equal((await client.query('select 1 from agent_skill_candidate_execution_lease where evaluation_id=$1',[pin.evaluationId])).rowCount,0));
 return {candidateTimedLeaseDatabaseVerified:true,leaseConcurrentClaimRejected:true,leaseActualTwentySecondRenewalVerified:true,
  leasePauseResumeAndHeartbeatCancelVerified:true,leaseShortDeadlineExpiryAndFencedTakeoverVerified:true,leaseFreezeRevocationAndCrossAccountRejected:true,
  leaseNinetySecondNaturalExpiryNotWaited:true,controlOperatorDatabaseOnly:true,actualModelCalls:0,productionAgentEquivalent:false};
}
