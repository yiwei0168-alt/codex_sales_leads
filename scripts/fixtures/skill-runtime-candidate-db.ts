import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {enqueueSkillCandidateRuntimeTask,claimSkillCandidateRuntimeTask} from '../../src/lib/assistant/main/skill-candidate-runtime-task';
import {runSkillRuntimeCandidate} from '../../src/lib/assistant/main/skill-runtime-candidate';
import {prepareRecordedSkillCandidateSnapshot} from '../../src/lib/assistant/main/skill-candidate-source';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';
import {auditSkillRuntimeCandidate} from '../../src/lib/assistant/main/skill-runtime-candidate-audit';
import {verifySkillRuntimeMaterialDatabase} from './skill-runtime-material-db';
import {readSkillAcceptanceReviewCase} from '../../src/lib/assistant/main/skill-acceptance-review';
import {skillCandidateCheckpointSchema} from '../../src/lib/assistant/main/skill-candidate-checkpoint';
import {readCandidateGraphCheckpoint} from './read-candidate-graph-checkpoint';
import {MainAgentState} from '../../src/lib/assistant/main/graph';

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
 const saved=await readCandidateGraphCheckpoint(pool,{owner,evaluationId:selection.evaluationId,arm:selection.arm});
 // Match graph.getState's declared channels; internal routing channels are not
 // product state and must not be passed to the strict product-state schema.
 const values=saved.checkpoint.channel_values;
 const state=Object.fromEntries(Object.keys(MainAgentState.spec).filter(key=>key in values).map(key=>[key,values[key]])),metadata=state.runtimeMetadata;
 assert(metadata&&typeof metadata==='object'&&!Array.isArray(metadata));
 assert.equal((metadata as {protocol?:unknown}).protocol,'skill-candidate-graph-checkpoint-v2');
 const recoveredState=skillCandidateCheckpointSchema.parse({...metadata,protocol:'skill-candidate-graph-checkpoint-v1',state});
 assert.equal(recoveredState.state.status,'completed');assert.equal(recoveredState.candidateSkillUsed,true);
 assert.equal(recoveredState.calls,5);assert.equal(recoveredState.trace.length,4);
 const auditInput={...selection,taskId:created.runId};
 // Completed-task admission now loads the owning settled execution policy
 // before rebuilding the source binding. The task above is still running.
 await assert.rejects(auditSkillRuntimeCandidate(context,auditInput,frozen.plan),{
  message:'Completed Skill runtime execution policy unavailable',
 });
 const tools=(await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[created.runId])).rows;
 assert.deepEqual(tools.map(row=>row.tool_id),['customer_timeline','skill_read']);assert(tools.every(row=>row.status==='completed'));
 const recovered=await runSkillRuntimeCandidate(claimed.context,selection,collector);
 assert.equal(recovered.taskStatus,'completed');assert.equal(recovered.status,'completed');assert.equal(recovered.candidateSkillUsed,true);
 assert.equal(recovered.registeredToolJournalUsed,true);assert.equal(recovered.modelCalls,5);assert.deepEqual(requests,[0,1,2,3,4]);
 assert.deepEqual((await pool.query('select id,step,input_hash from agent_skill_model_attempt where evaluation_id=$1 order by step',[selection.evaluationId])).rows,before);
 assert.deepEqual((await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[created.runId])).rows,tools);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[pin.skillId])).rows[0].enabled,false);
 const audit=await auditSkillRuntimeCandidate(context,auditInput,frozen.plan);
 assert.equal(audit.completeToolJournalVerified,true);assert.equal(audit.projection.candidateSkillUsed,true);
 assert.equal(audit.projection.toolReceipts.length,2);
 assert.deepEqual((await pool.query('select id,tool_id,status,output from agent_tool_call where run_id=$1 order by tool_id',[created.runId])).rows,tools);
 assert.deepEqual(requests,[0,1,2,3,4]);
 const skillRead=tools.find(row=>row.tool_id==='skill_read');assert(skillRead);
 const material=process.env.MA24_SKILL_RUNTIME_MATERIAL==='1'
  ?await verifySkillRuntimeMaterialDatabase(pool,owner,auditInput,frozen,transaction,recovered.reply)
  :{bundleId:undefined,checks:{runtimeUnifiedMaterialReviewVerified:false}};
 const tampered=structuredClone(skillRead.output);tampered.data.files['SKILL.md']='Synthetic tampered persisted instructions';
 await pool.query('update agent_tool_call set output=$2 where id=$1',[skillRead.id,tampered]);
 try{await assert.rejects(material.bundleId?readSkillAcceptanceReviewCase(context,{bundleId:material.bundleId,caseId:selection.caseId}):auditSkillRuntimeCandidate(context,auditInput,frozen.plan),/saved output differs/);}
 finally{await pool.query('update agent_tool_call set output=$2 where id=$1',[skillRead.id,skillRead.output]);}
 return {...material.checks,skillRuntimeCandidateGraphVerified:true,skillRuntimeCandidateModelAndRegisteredReadJournalsVerified:true,
  skillRuntimeIndependentGraphAuditVerified:true,skillRuntimeAuditRejectsUnsettledTaskAndPersistedToolTamper:true,skillRuntimeAuditDoesNotWriteOrRequest:true,
  skillRuntimeSettlementRollbackAndTerminalRecoveryVerified:true,skillRuntimeRecoveryNoModelOrToolReplay:true,
  skillRuntimeVirtualSkillDoesNotEnableAccount:true,actualModelCalls:0,productionAgentEquivalent:false,automaticActivation:false};
}
