import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {prepareRecordedSkillCandidateSnapshot} from '../../src/lib/assistant/main/skill-candidate-source';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {prepareSkillExecutionIdentity} from '../../src/lib/assistant/main/skill-runtime-identity';
import {createConfiguredSkillCollectorConnection} from '../../src/lib/assistant/main/skill-collector-connection';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import {enqueueSkillCandidateRuntimeTask,claimSkillCandidateRuntimeTask,assertSkillCandidateRuntimeTask} from '../../src/lib/assistant/main/skill-candidate-runtime-task';
import {getRun,listRuns,readEvents,claimRun,controlRun} from '../../src/lib/assistant/main/repository';
import {withSkillRuntimeTaskLease} from '../../src/lib/assistant/main/skill-runtime-task-lease';
import {dispatchTool} from '../../src/lib/assistant/main/executor';
import {verifySkillRuntimeCandidateDatabase} from './skill-runtime-candidate-db';

export async function verifySkillCandidateRuntimeTaskDatabase(pool:Pool,owner:string,other:string,runId:string,skillId:string){
 const context={userId:owner},selection={runId,skillId,version:1},connection=createConfiguredSkillCollectorConnection();
 try{
  const saved=await prepareRecordedSkillCandidateSnapshot(context,selection),baseline=await prepareSkillAcceptanceBaseline(context,{runId}),identity=await prepareSkillExecutionIdentity(context,{runId});
  const frozen=await freezeSkillAcceptancePlan(context,{protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId,version:1,
   contentHash:saved.snapshot.candidate.value.content_hash,sourceHash:saved.skillSourceHash},identity,expiresAt:new Date(Date.now()+3600000).toISOString(),
   cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:saved.taskInputHash,
    sourceHash:category==='replay'?baseline.projectionHash:digest(category),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))},connection.transaction);
  const pin={...selection,freezeId:frozen.freezeId,caseId:'replay',evaluationId:randomUUID(),arm:'candidate' as const};
  const original=(await pool.query('select * from agent_run where id=$1',[runId])).rows[0];
  const oldCalls=(await pool.query('select id,output from agent_tool_call where run_id=$1 order by id',[runId])).rows;
  const created=await enqueueSkillCandidateRuntimeTask(context,pin,frozen.plan);
  assert.deepEqual(await enqueueSkillCandidateRuntimeTask(context,pin,frozen.plan),created);
  const row=(await pool.query('select r.*,c.status conversation_status from agent_run r join assistant_conversation c on c.id=r.conversation_id where r.id=$1',[created.runId])).rows[0];
  assert.equal(row.execution_kind,'main-agent-evaluation');assert.equal(row.execution_spec.schema,'skill-candidate-task-v1');
  assert.equal(row.conversation_status,'deleted');assert.equal(row.status,'queued');assert.deepEqual(row.input.attachments,[]);
  assert.equal((await pool.query('select count(*)::int n from assistant_message where conversation_id=$1',[row.conversation_id])).rows[0].n,0);
  assert.equal(await getRun(owner,created.runId),null);assert(!(await listRuns(owner)).some(run=>run.id===created.runId));assert.deepEqual(await readEvents(owner,created.runId,'0'),[]);
  assert.equal(await claimRun('skill-runtime-ordinary-worker'),undefined);
  assert.equal((await pool.query('select * from claim_ma24_evaluation_run($1,$2,$3)',[created.runId,owner,'g16-must-not-claim-g09'])).rowCount,0);
  await assert.rejects(enqueueSkillCandidateRuntimeTask({userId:other},pin,frozen.plan),/plan owner/);
  await assert.rejects(enqueueSkillCandidateRuntimeTask(context,{...pin,caseId:'negative'},frozen.plan),/sources or frozen identity changed/);
  const claimed=await claimSkillCandidateRuntimeTask(context,{...pin,taskId:created.runId,workerId:'g09-explicit-fixture'},frozen.plan);
  await assertSkillCandidateRuntimeTask(claimed.context,pin,frozen.plan);
  await assert.rejects(claimSkillCandidateRuntimeTask(context,{...pin,taskId:created.runId,workerId:'duplicate'},frozen.plan),/already leased/);
  await assert.rejects(assertSkillCandidateRuntimeTask({...claimed.context,knowledgeScope:['industry']},pin,frozen.plan),/context changed/);
  await assert.rejects(assertSkillCandidateRuntimeTask({...claimed.context,evaluationArm:'baseline'},pin,frozen.plan),/context changed/);
  await assert.rejects(dispatchTool({id:'forged-discovery',type:'function',function:{name:'discover_tools',arguments:'{}'}},
   {...claimed.context,skillTaskSpecHash:digest('forged')}),/context binding changed/);
  await assert.rejects(dispatchTool({id:'foreign-discovery',type:'function',function:{name:'discover_tools',arguments:'{}'}},
   {...claimed.context,userId:other}),/context unavailable/);
  const denied=await dispatchTool({id:'forbidden-skill-enable',type:'function',function:{name:'execute_tool',
   arguments:JSON.stringify({tool:'skill_manage',arguments:{id:skillId,version:1,operation:'enable'}})}},claimed.context);
  assert.equal(denied.status,'unavailable');
  const output=await dispatchTool({id:'g09-runtime-skill-list',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'skill_list',arguments:{}})}},claimed.context);
  assert.equal(output.status,'success');assert(output.callId);
  const tool=(await pool.query('select tool_id,effect,status from agent_tool_call where id=$1',[output.callId])).rows[0];
  assert.deepEqual(tool,{tool_id:'skill_list',effect:'read',status:'completed'});
  await assertSkillCandidateRuntimeTask(claimed.context,pin,frozen.plan);
  const graph=process.env.MA24_SKILL_RUNTIME_GRAPH==='1'?await verifySkillRuntimeCandidateDatabase(pool,owner,pin,frozen,connection.transaction):{skillRuntimeCandidateGraphVerified:false};
  const controlPin={...pin,evaluationId:randomUUID()},controlTask=await enqueueSkillCandidateRuntimeTask(context,controlPin,frozen.plan);
  const controlClaim=await claimSkillCandidateRuntimeTask(context,{...controlPin,taskId:controlTask.runId,workerId:'g09-fresh-control-fixture'},frozen.plan);
  await controlRun(owner,controlTask.runId,'cancel');
  let invoked=false;await assert.rejects(withSkillRuntimeTaskLease(controlClaim.context,async()=>{invoked=true;}),/lease lost or controlled/);assert.equal(invoked,false);
  assert.equal((await pool.query('select status from agent_run where id=$1',[controlTask.runId])).rows[0].status,'cancelled');
  assert.equal((await pool.query('select count(*)::int n from agent_memory_extraction_job where run_id=$1',[controlTask.runId])).rows[0].n,0);
  await controlRun(owner,created.runId,'cancel');
  await assert.rejects(assertSkillCandidateRuntimeTask(claimed.context,pin,frozen.plan),/lease or context changed/);
  await revokeSkillAcceptanceFreeze(context,{freezeId:frozen.freezeId,reason:'Synthetic runtime admission revocation'});
  await assert.rejects(enqueueSkillCandidateRuntimeTask(context,{...pin,arm:'baseline'},frozen.plan),/freeze unavailable/);
  assert.deepEqual((await pool.query('select * from agent_run where id=$1',[runId])).rows[0],original);
  assert.deepEqual((await pool.query('select id,output from agent_tool_call where run_id=$1 order by id',[runId])).rows,oldCalls);
  assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skillId])).rows[0].enabled,false);
  assert.equal((await pool.query('select count(*)::int n from agent_memory_extraction_job where run_id=$1',[created.runId])).rows[0].n,0);
  return {...graph,skillRuntimeTaskAdmissionDatabaseVerified:true,skillRuntimeHiddenTaskAndIdempotencyVerified:true,skillRuntimeOrdinaryAndG16ClaimRejected:true,
   skillRuntimeExplicitClaimAndContextVerified:true,skillRuntimeRegisteredReadVerified:true,skillRuntimeCancellationAndFreezeRevocationRejected:true,skillRuntimeSharedLeaseCancelSettled:true,
   skillRuntimeOriginalTaskAndSkillUnchanged:true,actualModelCalls:0,productionAgentEquivalent:false,automaticActivation:false};
 }finally{await connection.close();}
}
