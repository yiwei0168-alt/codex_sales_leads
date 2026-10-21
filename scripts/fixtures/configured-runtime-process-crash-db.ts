import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {readCandidateGraphCheckpoint} from './read-candidate-graph-checkpoint';

type Exit={code:number|null;signal:string|null;output:string;diagnostic:string};
type Launch=(reuse?:boolean,crash?:boolean,minimumStep?:number)=>Promise<Exit>;

/** Actual child termination after a committed formal read, followed by default
 * lease expiry. Never edit a lease/token or manufacture a completion receipt. */
export async function verifyConfiguredRuntimeProcessCrash(pool:Pool,input:{owner:string;evaluationId:string},launch:Launch){
 const crash=await launch(false,true);
 assert.notEqual(crash.code,0,'Fault-injected process must terminate');
 assert(crash.output.includes('FIXTURE_RUNTIME_READ_COMMITTED'),'Termination point was not reached');
 const task=(await pool.query('select id,status,lease_token from agent_run where user_id=$1 and execution_spec->>\'evaluationId\'=$2',
  [input.owner,input.evaluationId])).rows;
 assert.equal(task.length,1);assert.equal(task[0].status,'running');const taskId=task[0].id as string;
 const models=async()=> (await pool.query(`select a.id,to_jsonb(a) attempt,to_jsonb(o) outcome from agent_skill_model_attempt a
  join agent_skill_model_outcome o on o.attempt_id=a.id where a.owner_id=$1 and a.evaluation_id=$2 and a.arm='candidate' order by a.step,a.route_index`,
 [input.owner,input.evaluationId])).rows;
 const tools=async()=> (await pool.query('select id,call_key,tool_id,status,to_jsonb(c) snapshot from agent_tool_call c where user_id=$1 and run_id=$2 order by id',
 [input.owner,taskId])).rows;
 const beforeModels=await models(),beforeTools=await tools();
 assert.equal(beforeModels.length,2);assert.equal(beforeTools.length,1);assert.equal(beforeTools[0].tool_id,'skill_read');assert.equal(beforeTools[0].status,'completed');
 const checkpoint=await readCandidateGraphCheckpoint(pool,{owner:input.owner,evaluationId:input.evaluationId,arm:'candidate'});
 assert((checkpoint.checkpoint.channel_values.pending as Array<{id:string}>).some(call=>call.id===beforeTools[0].call_key),'Committed read must still be pending in the saved graph');
 const lease=async()=> (await pool.query(`select e.execution_token,floor(extract(epoch from(greatest(r.lease_until,e.lease_until)-clock_timestamp()))*1000)::integer remaining_ms
  from agent_run r join agent_skill_candidate_execution_lease e on e.owner_id=r.user_id and e.evaluation_id=$2 and e.arm='candidate'
  where r.id=$1`,[taskId,input.evaluationId])).rows[0];
 const beforeLease=await lease();assert(beforeLease.remaining_ms>0&&beforeLease.remaining_ms<=95_000);
 const early=await launch();assert.notEqual(early.code,0,'Unexpired task must reject takeover');
 assert.deepEqual(await models(),beforeModels);assert.deepEqual(await tools(),beforeTools);
 assert.equal((await lease()).execution_token,beforeLease.execution_token);
 const timeout=Date.now()+120_000;
 while((await lease()).remaining_ms>0){assert(Date.now()<timeout,'Killed process leases did not naturally expire');await new Promise(done=>setTimeout(done,1000));}
 // Any repeat HTTP for already completed steps is an explicit fixture failure.
 const exit=await launch(false,false,2);assert.equal(exit.code,0,`Expired formal task recovery failed: ${exit.diagnostic}`);
 assert.equal((await pool.query('select status from agent_run where id=$1',[taskId])).rows[0].status,'completed');
 assert.notEqual((await lease()).execution_token,beforeLease.execution_token);
 const afterModels=await models(),afterTools=await tools();
 assert.deepEqual(afterModels.filter(row=>beforeModels.some(old=>old.id===row.id)),beforeModels);
 assert.deepEqual(afterTools.filter(row=>beforeTools.some(old=>old.id===row.id)),beforeTools);
 return {exit,formalTaskProcessTerminatedAfterCommittedRead:true,formalTaskEarlyTakeoverRejected:true,
  formalTaskDefaultLeaseNaturallyExpired:true,formalTaskNewProcessRecoveredPendingRead:true,
  formalTaskRecoveryPreservedCommittedModelAndToolRows:true,formalTaskRecoveryRejectsRepeatedCompletedHttpSteps:true,
  actualModelCalls:0};
}
