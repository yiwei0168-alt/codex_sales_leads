import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {withSkillCandidateExecution} from '../../src/lib/assistant/main/skill-candidate-execution';
import {createSkillModelJournal,type SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {digest} from '../../src/lib/assistant/main/contracts';

/** Independent disposable-cluster ownership and late-receipt component test. */
export async function verifySkillCandidateExecutionDatabase(pool:Pool,owner:string,transaction:SkillCollectorTransaction){
 assert(transaction.execution,'Configured collector needs a separate ownership channel');
 const pin={ownerId:owner,evaluationId:randomUUID(),arm:'candidate' as const};
 let enter!:()=>void,release!:()=>void,retained:(()=>Promise<void>)|undefined;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
 const first=withSkillCandidateExecution(transaction,pin,async check=>{retained=check;enter();await released;await check();});
 try{
  await Promise.race([entered,first.then(()=>{throw new Error('Ownership scope exited before fixture entry');})]);let repeated=false;const started=Date.now();
  await assert.rejects(withSkillCandidateExecution(transaction,pin,async()=>{repeated=true;}),/already owned/);
  assert.equal(repeated,false);assert(Date.now()-started<4000,'Conflicting execution must reject without waiting for its owner');
  const input={messages:[{role:'user',content:'Synthetic ownership request'}],profile:modeModelConfig('quick').profile!,index:0};
  await withSkillCandidateExecution(transaction,{...pin,arm:'baseline'},async check=>{
   await Promise.all((['baseline','candidate'] as const).map(async arm=>{
    const journal=createSkillModelJournal(transaction,{...pin,arm,step:0,snapshotHash:digest('ownership'),sourceKind:'synthetic-fixture'});
    const attempt=await journal.begin(input);assert.equal(attempt.fresh,true);
    await journal.save(attempt.id,0,{status:'unavailable',retryable:false,reason:'synthetic-no-provider-request'});
   }));await check();
  });
 }finally{release();await first;}
 await assert.rejects(retained!(),/scope ended/);
 await withSkillCandidateExecution(transaction,pin,async check=>check());
 await assert.rejects(withSkillCandidateExecution(transaction,pin,async()=>{throw new Error('Synthetic ownership failure');}),/Synthetic ownership failure/);
 await withSkillCandidateExecution(transaction,pin,async check=>check());

 // Kill only the synthetic ownership backend. Late outcomes use another pool.
 let backend:number|undefined;const isolated:SkillCollectorTransaction=async(ownerId,work)=>transaction(ownerId,work);
 isolated.execution=async(ownerId,work)=>transaction.execution!(ownerId,async client=>{
  backend=(await client.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;return work(client);
 });
 const lostPin={...pin,evaluationId:randomUUID()},journal=createSkillModelJournal(transaction,{...lostPin,step:0,snapshotHash:digest('lost-owner'),sourceKind:'synthetic-fixture'});
 const input={messages:[{role:'user',content:'Synthetic late receipt'}],profile:modeModelConfig('quick').profile!,index:0};
 let attemptId:string|undefined;
 await assert.rejects(withSkillCandidateExecution(isolated,lostPin,async check=>{
  const attempt=await journal.begin(input);attemptId=attempt.id;assert(attempt.fresh&&backend);
  assert.equal((await pool.query('select pg_terminate_backend($1) terminated',[backend])).rows[0].terminated,true);
  await journal.save(attempt.id,0,{status:'unavailable',retryable:false,reason:'synthetic-late-receipt'});
  await check();
 }));
 await withSkillCandidateExecution(transaction,lostPin,async check=>{
  const recovered=await journal.begin(input);assert.equal(recovered.id,attemptId);assert.equal(recovered.fresh,false);
  assert.deepEqual(recovered.output,{status:'unavailable',data:{retryable:false,reason:'synthetic-late-receipt'}});await check();
 });
 return {candidateExecutionOwnershipVerified:true,concurrentSameArmRejected:true,otherArmAndJournalPoolCapacityVerified:true,
  ownershipRollbackAndBackendLossReacquired:true,lateReceiptPreservedAfterOwnershipLoss:true,closedGuardRejected:true,
  syntheticFixture:true,actualModelCalls:0,productionAgentEquivalent:false};
}
