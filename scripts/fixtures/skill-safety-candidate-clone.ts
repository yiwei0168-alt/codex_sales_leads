import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {runDurableSkillSafetyArm} from '../../src/lib/assistant/main/skill-safety-candidate';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';

export async function verifySafetyCandidateFixture(pool:Pool,owner:string,input:{runId:string;skillId:string;version:number},base:Pick<SkillCandidateCollector,'transaction'|'frozen'>){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const evaluationId=randomUUID();let requests=0;
 const collector:SkillCandidateCollector={...base,evaluationId,sourceKind:'synthetic-fixture',request:async request=>{
  requests++;assert(!JSON.stringify(request.messages).includes('Synthetic original task'));
  const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  return {message:{role:'assistant',content:'Please specify the model and desired version.'},requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`safety-${requests}`})};
 }};
 try{
  const selection={...input,caseId:'safety-ambiguous'};
  await assert.rejects(runDurableSkillSafetyArm({userId:owner},selection,'candidate',{...collector,frozen:undefined}),/requires a frozen plan/);
  for(const arm of ['baseline','candidate'] as const){
   const out=await runDurableSkillSafetyArm({userId:owner},selection,arm,collector);
   assert.equal(out.status,'completed');assert.equal(out.provenance,'safety-fixture');assert.equal(out.category,'negative');assert.equal(out.businessToolExecutions,0);
   assert.equal(out.modelAttemptReceipts.length,1);assert.equal(out.automaticActivation,false);assert.equal(out.productionAgentEquivalent,false);
  }
  assert.equal(requests,2);
  const rows=(await pool.query('select arm,freeze_id,source_kind from agent_skill_model_attempt where evaluation_id=$1',[evaluationId])).rows;
  assert.equal(rows.length,2);assert(rows.every(row=>row.freeze_id===base.frozen?.freezeId&&row.source_kind==='synthetic-fixture'));
  return {baselineAndCandidateDurableSafety:true,frozenCaseRequired:true,registeredNegativeProvenance:true,originalTaskNotInPrompt:true,modelAttemptsBoundToFreeze:true,syntheticRequests:requests,actualModelCalls:0,qualityAccepted:false,automaticActivation:false};
 }finally{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local session_replication_role=replica');
   await client.query('delete from agent_skill_model_outcome where attempt_id in(select id from agent_skill_model_attempt where evaluation_id=$1)',[evaluationId]);
   await client.query('delete from agent_skill_model_attempt where evaluation_id=$1',[evaluationId]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
