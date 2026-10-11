import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {runDurableRecordedSkillCandidateArm} from '../../src/lib/assistant/main/skill-candidate-source';
import {createSkillModelJournal,type SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import {revokeSkillAcceptanceFreeze} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import {ModelWaitError} from '../../src/lib/assistant/main/model-stream';
import {digest} from '../../src/lib/assistant/main/contracts';
import {auditDurableSkillCandidate} from '../../src/lib/assistant/main/skill-candidate-audit';
import {prepareFrozenCandidateFixture,verifyCandidateAcceptanceFixture} from './skill-candidate-acceptance-clone';

export async function verifyDurableCandidateFixture(pool:Pool,owner:string,input:{runId:string;skillId:string;version:number}){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const evaluationId=randomUUID();let requests=0;
 const transaction:SkillCollectorTransaction=async(userId,work)=>{
  const client=await pool.connect();try{
   await client.query('begin');await client.query('set local role network_copilot_skill_collector');await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
   const out=await work(client);await client.query('commit');return out;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 const frozen=await prepareFrozenCandidateFixture(pool,owner,input.runId,input.skillId,transaction);
 try{
  const collector={frozen,evaluationId,sourceKind:'synthetic-fixture' as const,transaction,request:async(request:Parameters<import('../../src/lib/assistant/main/skill-candidate-model').SkillCandidateRequest>[0])=>{
   requests++;const completed=request.messages.filter(message=>message.role==='assistant').length;
   if(completed===0&&request.index===0)throw new ModelWaitError('first-output');
   const tool=completed===0?'describe_tool':'execute_tool',args=completed===0?{tool:'skill_read'}:{tool:'skill_read',arguments:{id:input.skillId}};
   const message=completed<2?{role:'assistant',content:null,tool_calls:[{id:'same-provider-call-id',type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:'Synthetic durable answer.'};
   const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
   return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`fixture-${completed}-${request.index}`})};
  }};
  const first=await runDurableRecordedSkillCandidateArm({userId:owner},input,'candidate',collector);
  assert.equal(first.status,'completed');assert.equal(first.candidateSkillUsed,true);assert.equal(requests,4);
  assert.equal(first.modelAttemptReceipts.length,4);assert(first.modelAttemptReceipts.every(row=>!row.recovered));
  const audited=await auditDurableSkillCandidate({userId:owner},{...input,evaluationId,arm:'candidate'});
  assert.equal(audited.projection.freezeId,frozen.freezeId);assert.equal(audited.graphReconstructed,true);assert.equal(audited.completeModelJournalVerified,true);
  assert.equal(audited.projection.answerHash,digest(first.reply));assert.equal(audited.projection.messagesHash,digest(first.messages));assert.equal(audited.projection.traceHash,digest(first.trace));
  assert.equal(audited.projection.sourceKind,'synthetic-fixture');assert.equal(audited.automaticActivation,false);assert.equal(requests,4);
  await assert.rejects(auditDurableSkillCandidate({userId:randomUUID()},{...input,evaluationId,arm:'candidate'}),/unavailable/);
  const second=await runDurableRecordedSkillCandidateArm({userId:owner},input,'candidate',collector);
  assert.equal(second.status,'completed');assert.equal(requests,4);assert(second.modelAttemptReceipts.every(row=>row.recovered));
  assert.equal(digest(first.messages),digest(second.messages));assert.equal(digest(first.trace),digest(second.trace));
  const calls=first.messages.flatMap(message=>message.tool_calls??[]);assert.equal(new Set(calls.map(row=>row.id)).size,2);
  assert.equal(first.automaticActivation,false);assert.equal(first.collectorProvenanceVerified,false);
  const rows=(await pool.query(`select a.freeze_id,a.source_kind,a.snapshot_hash,a.input,o.output from agent_skill_model_attempt a
   join agent_skill_model_outcome o on o.attempt_id=a.id where a.evaluation_id=$1 order by a.step,a.route_index`,[evaluationId])).rows;
  assert.equal(rows.length,4);assert(rows.every(row=>row.freeze_id===frozen.freezeId&&row.source_kind==='synthetic-fixture'&&row.snapshot_hash===first.serverSnapshotHash));
  assert.equal(rows[0].output.status,'unavailable');assert.equal(rows[0].output.data.retryable,true);
  const binding={ownerId:owner,evaluationId,arm:'candidate' as const,step:0,snapshotHash:first.serverSnapshotHash,sourceKind:'synthetic-fixture' as const};
  await assert.rejects(createSkillModelJournal(transaction,binding).begin(rows[0].input),/binding changed/);
  console.log(JSON.stringify({candidateAcceptance:await verifyCandidateAcceptanceFixture(pool,owner,input.runId,input.skillId,audited,frozen),cloneOnly:true}));
  await revokeSkillAcceptanceFreeze({userId:owner},{freezeId:frozen.freezeId,reason:'Synthetic revocation guard'});
  await assert.rejects(runDurableRecordedSkillCandidateArm({userId:owner},input,'candidate',collector),/revoked/);assert.equal(requests,4);
  await assert.rejects(createSkillModelJournal(transaction,{...binding,freezeId:frozen.freezeId}).begin(rows[0].input),/freeze unavailable/);
  return {journalFreezePersisted:true,recoveryCannotRemoveFreeze:true,databaseRejectsRevokedAdmission:true,revokedFreezeStopsExecution:true,realGraphAndPersistentJournalConnected:true,failureThenFallback:true,recoveryWithoutAdditionalRequests:true,stableRemappedCallIds:true,
   messagesAndTraceIdenticalOnRecovery:true,snapshotAndSyntheticKindBound:true,readOnlyJournalAuditReconstructedGraph:true,auditCrossAccountRejected:true,syntheticRequests:requests,actualModelCalls:0,automaticActivation:false};
 }finally{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local session_replication_role=replica');
   await client.query('delete from agent_skill_model_outcome where attempt_id in(select id from agent_skill_model_attempt where evaluation_id=$1)',[evaluationId]);
   await client.query('delete from agent_skill_model_attempt where evaluation_id=$1',[evaluationId]);
   await client.query('delete from agent_skill_acceptance_freeze_revocation where freeze_id=$1',[frozen.freezeId]);
   await client.query('delete from agent_skill_acceptance_freeze where id=$1',[frozen.freezeId]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
