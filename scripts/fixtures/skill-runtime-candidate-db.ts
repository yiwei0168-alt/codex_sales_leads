import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {enqueueSkillCandidateRuntimeTask,claimSkillCandidateRuntimeTask} from '../../src/lib/assistant/main/skill-candidate-runtime-task';
import {runSkillRuntimeCandidate} from '../../src/lib/assistant/main/skill-runtime-candidate';
import {prepareRecordedSkillCandidateSnapshot} from '../../src/lib/assistant/main/skill-candidate-source';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';

export async function verifySkillRuntimeCandidateDatabase(pool:Pool,owner:string,pin:Parameters<typeof enqueueSkillCandidateRuntimeTask>[1],
 frozen:NonNullable<SkillCandidateCollector['frozen']>,transaction:SkillCandidateCollector['transaction']){
 const selection={...pin,evaluationId:randomUUID()},context={userId:owner};
 const snapshot=await prepareRecordedSkillCandidateSnapshot(context,{runId:pin.runId,skillId:pin.skillId,version:pin.version});
 const read=snapshot.snapshot.receipts.find(row=>row.tool==='customer_timeline');assert(read);
 const created=await enqueueSkillCandidateRuntimeTask(context,selection,frozen.plan);
 const claimed=await claimSkillCandidateRuntimeTask(context,{...selection,taskId:created.runId,workerId:'synthetic-runtime-graph'},frozen.plan);
 const requests:number[]=[];
 const collector:SkillCandidateCollector={evaluationId:selection.evaluationId,sourceKind:'synthetic-fixture',transaction,frozen,request:async request=>{
  requests.push(request.step);assert(request.step<=4);
  const inputs=[{tool:'skill_read'},{tool:'skill_read',arguments:{id:pin.skillId}},{tool:'customer_timeline'},
   {tool:'customer_timeline',arguments:read.arguments}];
  const message=request.step<4?{role:'assistant',content:null,tool_calls:[{id:`runtime-${request.step}`,type:'function',function:{
   name:request.step%2===0?'describe_tool':'execute_tool',arguments:JSON.stringify(inputs[request.step])}}]}:
   {role:'assistant',content:'Synthetic formal-dispatch candidate answer'};
  const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`runtime-${request.step}`})};
 }};
 // Fail a real application settlement transaction after the terminal graph was
 // durably saved. Product code has no test-only interruption hook.
 await pool.query(`create function ma24_skill_runtime_settlement_fault() returns trigger language plpgsql as $$ begin raise exception 'Synthetic runtime settlement withheld'; end $$`);
 await pool.query(`create trigger ma24_skill_runtime_settlement_fault before update on agent_run for each row
  when(new.id='${created.runId}'::uuid and new.status='completed') execute function ma24_skill_runtime_settlement_fault()`);
 try{
  await assert.rejects(runSkillRuntimeCandidate(claimed.context,selection,collector),/Synthetic runtime settlement withheld/);
 }finally{
  await pool.query('drop trigger if exists ma24_skill_runtime_settlement_fault on agent_run');
  await pool.query('drop function if exists ma24_skill_runtime_settlement_fault()');
 }
 assert.deepEqual(requests,[0,1,2,3,4]);
 const before=(await pool.query('select id,step,input_hash from agent_skill_model_attempt where evaluation_id=$1 order by step',[selection.evaluationId])).rows;
 assert.equal(before.length,5);
 assert.equal((await pool.query('select status from agent_run where id=$1',[created.runId])).rows[0].status,'running');
 const saved=(await pool.query('select payload from agent_skill_candidate_checkpoint where evaluation_id=$1',[selection.evaluationId])).rows[0];
 assert.equal(saved.payload.state.status,'completed');assert.equal(saved.payload.candidateSkillUsed,true);
 const tools=(await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[created.runId])).rows;
 assert.deepEqual(tools.map(row=>row.tool_id),['customer_timeline','skill_read']);assert(tools.every(row=>row.status==='completed'));
 const recovered=await runSkillRuntimeCandidate(claimed.context,selection,collector);
 assert.equal(recovered.taskStatus,'completed');assert.equal(recovered.status,'completed');assert.equal(recovered.candidateSkillUsed,true);
 assert.equal(recovered.registeredToolJournalUsed,true);assert.equal(recovered.modelCalls,5);assert.deepEqual(requests,[0,1,2,3,4]);
 assert.deepEqual((await pool.query('select id,step,input_hash from agent_skill_model_attempt where evaluation_id=$1 order by step',[selection.evaluationId])).rows,before);
 assert.deepEqual((await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[created.runId])).rows,tools);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[pin.skillId])).rows[0].enabled,false);
 return {skillRuntimeCandidateGraphVerified:true,skillRuntimeCandidateModelAndRegisteredReadJournalsVerified:true,
  skillRuntimeSettlementRollbackAndTerminalRecoveryVerified:true,skillRuntimeRecoveryNoModelOrToolReplay:true,
  skillRuntimeVirtualSkillDoesNotEnableAccount:true,actualModelCalls:0,productionAgentEquivalent:false,automaticActivation:false};
}
