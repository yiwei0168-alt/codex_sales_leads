import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {importSkill} from '../../src/lib/assistant/main/skills';
import {runRecordedSkillCandidateArm} from '../../src/lib/assistant/main/skill-candidate-source';
import {loadRecordedTaskChain} from '../../src/lib/assistant/main/recorded-task-source';
import {digest,toolResultSchema} from '../../src/lib/assistant/main/contracts';
import {verifyDurableCandidateFixture} from './skill-durable-candidate-clone';

/** Synthetic accounts and task only; caller blocks network and asserts clone database. */
export async function verifyCandidateSourceFixture(pool:Pool,owner:string,other:string,runId:string,onReviewReady?:(bundleId:string,skillId:string)=>Promise<void>){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const context={userId:owner},original=await loadRecordedTaskChain(context,{runId});
 const skill=await importSkill({...context,role:'member'},{name:'Candidate source fixture',source:'synthetic-fixture',files:{'SKILL.md':'Check original evidence.'},dependencies:[]});
 const input={runId,skillId:skill.id,version:1};let callbacks=0;
 const call=(tool:string,args:unknown,id:string)=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]});
 const steps=[call('describe_tool',{tool:'skill_read'},'describe'),call('execute_tool',{tool:'skill_read',arguments:{id:skill.id}},'read'),
  call('describe_tool',{tool:'memory_read'},'describe-memory'),call('execute_tool',{tool:'memory_read',arguments:{}},'read-memory'),{role:'assistant',content:'Synthetic candidate response.'}];
 try{
  const durableCandidate=await verifyDurableCandidateFixture(pool,owner,input,onReviewReady);
  console.log(JSON.stringify({durableCandidate,cloneOnly:true}));
  for(const arm of ['baseline','candidate'] as const){
   let index=0;
   const out=await runRecordedSkillCandidateArm(context,input,arm,async request=>{
    callbacks++;if(index===0)assert.equal(digest(request.messages),digest(original.requests[0].body.messages));
    assert.deepEqual(request.profile,original.requests[0].profile);return steps[index++];
   });
   assert.equal(out.status,'completed');assert.equal(out.candidateSkillUsed,arm==='candidate');
   assert.equal(out.serverSnapshotRevalidated,true);assert.equal(out.productionAgentEquivalent,false);assert.equal(out.automaticActivation,false);
   const read=out.messages.find(message=>message.role==='tool'&&message.tool_call_id==='read');
   assert(read);const data=JSON.parse(read.content!).data;
   if(arm==='candidate'){assert.equal(data.skill_id,skill.id);assert.equal(data.version,1);}else assert.equal(data,null);
   const memory=out.messages.find(message=>message.role==='tool'&&message.tool_call_id==='read-memory');assert(memory);
   const stored=(await pool.query("select output from agent_tool_call where run_id=$1 and tool_id='memory_read'",[runId])).rows[0].output;
   assert.equal(digest(JSON.parse(memory.content!)),digest(toolResultSchema.parse(stored)));
   assert(out.trace.find(row=>row.id==='read-memory')?.receiptHash);
  }
  const forbidden=async()=>{throw new Error('Model must not be reached');};
  await assert.rejects(runRecordedSkillCandidateArm({userId:other},input,'candidate',forbidden),/unavailable/);
  await assert.rejects(runRecordedSkillCandidateArm(context,{...input,version:2},'candidate',forbidden),/unavailable/);
  const foreign=await importSkill({userId:other,role:'member'},{name:'Foreign candidate',source:'synthetic-fixture',files:{'SKILL.md':'Private synthetic instructions.'},dependencies:[]});
  try{await assert.rejects(runRecordedSkillCandidateArm(context,{...input,skillId:foreign.id},'candidate',forbidden),/unavailable/);}
  finally{await pool.query('delete from agent_skill_version where skill_id=$1',[foreign.id]);await pool.query('delete from agent_skill where id=$1',[foreign.id]);}
  await pool.query('update agent_skill set enabled=true where id=$1',[skill.id]);
  await assert.rejects(runRecordedSkillCandidateArm(context,input,'candidate',forbidden),/unavailable/);
  await pool.query('update agent_skill set enabled=false where id=$1',[skill.id]);
  await assert.rejects(runRecordedSkillCandidateArm(context,input,'candidate',async()=>{
   callbacks++;await pool.query("update agent_skill set name='Changed during callback' where id=$1",[skill.id]);return steps[0];
  }),/sources changed/);
  assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
  const after=await loadRecordedTaskChain(context,{runId});assert.equal(after.sourceHash,original.sourceHash);
  assert.equal((await pool.query('select count(*)::int as count from agent_run_skill where run_id=$1',[runId])).rows[0].count,0);
  return {baselineAndCandidateGraphCompleted:true,originalMessagesAndProfilePreserved:true,crossAccountTaskAndSkillRejected:true,missingVersionAndEnabledRejected:true,
   midCallbackSourceChangeRejected:true,originalJournalUnchanged:true,exactRecordedReadReturned:true,noProductionSkillPins:true,syntheticCallbacks:callbacks,actualModelCalls:0,automaticActivation:false};
 }finally{
  await pool.query('delete from agent_skill_version where skill_id=$1',[skill.id]);await pool.query('delete from agent_skill where id=$1',[skill.id]);
 }
}
