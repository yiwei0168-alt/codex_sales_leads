import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {createSkillModelJournal,type SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {digest} from '../../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {modelFunctions} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import {orderedModeDecision} from '../../src/lib/assistant/main/mode-fallback';
import {ModelWaitError} from '../../src/lib/assistant/main/model-stream';

export async function verifySkillModelJournalFixture(pool:Pool,owner:string,other:string){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const transaction:SkillCollectorTransaction=async(userId,work)=>{
  const client=await pool.connect();try{
   await client.query('begin');await client.query('set local role network_copilot_skill_collector');
   await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
   const value=await work(client);await client.query('commit');return value;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 const pin={ownerId:owner,evaluationId:randomUUID(),arm:'candidate' as const,step:0,snapshotHash:digest('synthetic snapshot'),sourceKind:'synthetic-fixture' as const};
 const input={messages:[{role:'user' as const,content:'Synthetic journal task'}],profile:modeModelConfig('quick').profile!,index:0};
 const journal=createSkillModelJournal(transaction,pin);
 try{
  const [a,b]=await Promise.all([journal.begin(input),journal.begin(input)]);assert.equal(a.id,b.id);assert.equal(Number(a.fresh)+Number(b.fresh),1);
  await assert.rejects(journal.begin({...input,messages:[{role:'user',content:'Changed task'}]}),/binding changed/);
  await assert.rejects(createSkillModelJournal(transaction,{...pin,snapshotHash:digest('changed')}).begin(input),/binding changed/);
  let requests=0;
  await assert.rejects(orderedModeDecision({begin:()=>journal.begin(input),request:async()=>{requests++;return {};},save:journal.save}),/reconciliation/);
  assert.equal(requests,0);
  await journal.save(a.id,0,{status:'unavailable',retryable:true,reason:'timeout-first-output'});
  await journal.save(a.id,0,{status:'unavailable',retryable:true,reason:'timeout-first-output'});
  await assert.rejects(journal.save(a.id,0,{status:'unavailable',retryable:false,reason:'changed'}),/outcome conflict/);
  const success=(index:number)=>{
   const route=input.profile.routes[index],body={model:route.model,messages:input.messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
   return {message:{role:'assistant',content:'Synthetic reply'},requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:'synthetic-generation'})};
  };
  const run=()=>orderedModeDecision({begin:(index:number)=>journal.begin({...input,index}),request:async(index:number)=>{requests++;return success(index);},save:journal.save});
  const first=await run();assert.equal(requests,1);assert.equal(digest(await run()),digest(first));assert.equal(requests,1);
  await assert.rejects(createSkillModelJournal(transaction,{...pin,ownerId:other}).save(a.id,0,{status:'unavailable',retryable:false,reason:'forged'}),/unavailable/);
  await transaction(other,async client=>{assert.equal((await client.query('select id from agent_skill_model_attempt where id=$1',[a.id])).rowCount,0);});
  const attempt2=await journal.begin({...input,index:2});
  await assert.rejects(journal.save(attempt2.id,2,{status:'success',value:success(1)}),/wire binding invalid/);
  const app=await pool.connect();try{
   await app.query('begin');await app.query('set local role network_copilot_app');await app.query("select set_config('app.current_user_id',$1,true)",[owner]);
   await assert.rejects(app.query('insert into agent_skill_model_outcome(attempt_id,owner_id,output,output_hash) values($1,$2,$3,$4)',[attempt2.id,owner,'{}',digest({})]),/permission denied/);
   await app.query('rollback');
  }finally{app.release();}
  await assert.rejects(pool.query("update agent_skill_model_attempt set input='{}' where id=$1",[a.id]),/append-only/);
  await assert.rejects(pool.query('delete from agent_skill_model_outcome where attempt_id=$1',[a.id]),/append-only/);
  await assert.rejects(createSkillModelJournal(async(_id,work)=>{const client=await pool.connect();try{return await work(client);}finally{client.release();}},pin).begin(input),/restricted Skill collector/);
  // A separate attempt proves the shared fallback engine persists failures before advancing.
  const retry=createSkillModelJournal(transaction,{...pin,step:1});let attempts=0;
  await orderedModeDecision({begin:index=>retry.begin({...input,index}),request:async index=>{attempts++;if(index===0)throw new ModelWaitError('first-output');return success(index);},save:retry.save});
  assert.equal(attempts,2);
  return {concurrentSingleAdmission:true,unknownStartedAttemptNotRepeated:true,changedInputAndSnapshotRejected:true,successReused:true,conflictingOutcomeRejected:true,
   crossAccountHiddenAndWriteRejected:true,wrongRouteReceiptRejected:true,ordinaryAppInsertDenied:true,ordinaryOwnerRewriteDenied:true,restrictedCollectorRequired:true,failureSavedBeforeFallback:true,actualModelCalls:0};
 }finally{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local session_replication_role=replica');
   await client.query('delete from agent_skill_model_outcome where attempt_id in(select id from agent_skill_model_attempt where evaluation_id=$1)',[pin.evaluationId]);
   await client.query('delete from agent_skill_model_attempt where evaluation_id=$1',[pin.evaluationId]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
