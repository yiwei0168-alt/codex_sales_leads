import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {withSkillCandidateLease} from '../../src/lib/assistant/main/skill-candidate-lease';
import {prepareSkillCandidateCheckpoint,type SkillCandidateCheckpointStore} from '../../src/lib/assistant/main/skill-candidate-checkpoint';
import {createDurableSkillCandidateModel} from '../../src/lib/assistant/main/skill-candidate-model';
import {runSkillCandidateArm} from '../../src/lib/assistant/main/skill-candidate-runner';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';
import {decisionMemoryMessage} from '../../src/lib/assistant/main/decision-memory-message';
import {digest} from '../../src/lib/assistant/main/contracts';
import {verifySkillCandidateProcessCrashDatabase} from './skill-candidate-process-crash-db';

export async function verifySkillCandidateCheckpointDatabase(pool:Pool,owner:string,other:string,skillId:string,transaction:SkillCollectorTransaction){
 const config=modeModelConfig('standard'),context={userId:owner,role:'member' as const,mode:'standard' as const};
 const initial=initialTaskMessages(context,{content:'Synthetic checkpoint recovery',attachments:[]},config,[]);
 const value=(await pool.query('select v.*,s.owner_id,s.scope from agent_skill_version v join agent_skill s on s.id=v.skill_id where s.id=$1 and v.version=1',[skillId])).rows[0];
 const listing={id:skillId,name:'Synthetic checkpoint Skill',scope:'account',current_version:1,enabled:false,published:false,owned:true};
 const snapshot={context,initialMessages:[initial[0],decisionMemoryMessage([]),...initial.slice(1)],profile:config.profile!,skills:[listing],candidate:{listing,value},receipts:[]};
 const pin={ownerId:owner,evaluationId:randomUUID(),arm:'candidate' as const,sourceKind:'synthetic-fixture' as const},binding={...pin,snapshotHash:digest(snapshot)};
 let requests=0,crash=true;
 const run=()=>withSkillCandidateLease(transaction,pin,async(check,executionToken)=>{
  const store=await prepareSkillCandidateCheckpoint(transaction,binding,executionToken,check);assert(store);
  const durable=createDurableSkillCandidateModel({ownerId:owner,snapshotHash:binding.snapshotHash,arm:pin.arm},
   {evaluationId:pin.evaluationId,sourceKind:'synthetic-fixture',transaction,request:async request=>{
    requests++;const tool=request.step===0?'describe_tool':'execute_tool';
    const message=request.step<2?{role:'assistant',content:null,tool_calls:[{id:`provider-${request.step}`,type:'function',function:{name:tool,
     arguments:JSON.stringify(request.step===0?{tool:'skill_read'}:{tool:'skill_read',arguments:{id:skillId}})}}]}:{role:'assistant',content:'Synthetic recovered answer'};
    const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
    return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`checkpoint-${request.step}`})};
   }},check);
  const checkpoint:SkillCandidateCheckpointStore={load:store.load,save:async payload=>{
   await store.save(payload);
   if(crash&&payload.state.pending[0]?.function.name==='execute_tool'){crash=false;throw new Error('Synthetic persisted checkpoint response lost');}
  }};
  return runSkillCandidateArm(snapshot,pin.arm,durable.model,check,8,checkpoint);
 });
 await assert.rejects(run(),/Synthetic persisted checkpoint response lost/);assert.equal(requests,2);
 const pending=(await pool.query('select revision,payload,payload_hash from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2',[owner,pin.evaluationId])).rows[0];
 assert.equal(pending.payload.state.pending.length,1);assert.equal(pending.payload.calls,2);assert.equal(digest(pending.payload),pending.payload_hash);
 const recovered=await run();assert.equal(requests,3);assert.equal(recovered.status,'completed');assert.equal(recovered.candidateSkillUsed,true);
 assert.equal(recovered.modelCalls,3);assert.equal(recovered.trace.length,2);assert.equal(recovered.messages.filter(row=>row.role==='tool').length,2);
 assert.deepEqual(await run(),recovered);assert.equal(requests,3,'Terminal checkpoint cannot repeat completed requests');

 // Intentionally omit the in-memory scope check to exercise the SQL token fence
 // against a writer that had passed its precheck before losing ownership.
 let stale:SkillCandidateCheckpointStore|undefined,staleToken='';
 await withSkillCandidateLease(transaction,pin,async(_check,executionToken)=>{
  staleToken=executionToken;
  stale=await prepareSkillCandidateCheckpoint(transaction,binding,executionToken,async()=>{});
 });
 await withSkillCandidateLease(transaction,pin,async(check,executionToken)=>{
  const fresh=await prepareSkillCandidateCheckpoint(transaction,binding,executionToken,check);assert(fresh&&stale);
  const payload=await fresh.load();assert(payload);
  await assert.rejects(stale.save(payload),/ownership.*changed/);
  await assert.rejects(prepareSkillCandidateCheckpoint(transaction,binding,staleToken,async()=>{}),/lease ownership changed/);
  const retained=(await pool.query('select execution_token from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2',[owner,pin.evaluationId])).rows[0];
  assert.equal(retained.execution_token,executionToken,'Delayed old claim cannot replace the new checkpoint owner');
  const concurrent=await prepareSkillCandidateCheckpoint(transaction,binding,executionToken,check);assert(concurrent);
  await fresh.save(payload);await assert.rejects(concurrent.save(payload),/ownership or revision changed/);
  await assert.rejects(prepareSkillCandidateCheckpoint(transaction,{...binding,snapshotHash:digest('changed')},executionToken,check),/binding changed/);
 });
 const before=(await pool.query('select payload,payload_hash from agent_skill_candidate_checkpoint where owner_id=$1 and evaluation_id=$2',[owner,pin.evaluationId])).rows[0];
 await pool.query("update agent_skill_candidate_checkpoint set payload=jsonb_set(payload,'{state,reply}','\"Tampered\"'::jsonb) where owner_id=$1 and evaluation_id=$2",[owner,pin.evaluationId]);
 await assert.rejects(run(),/payload changed/);assert.equal(requests,3);
 await pool.query('update agent_skill_candidate_checkpoint set payload=$3,payload_hash=$4 where owner_id=$1 and evaluation_id=$2',[owner,pin.evaluationId,before.payload,before.payload_hash]);
 assert.deepEqual(await run(),recovered);assert.equal(requests,3);
 await transaction(other,async client=>assert.equal((await client.query('select 1 from agent_skill_candidate_checkpoint where evaluation_id=$1',[pin.evaluationId])).rowCount,0));
 const app=await pool.connect();try{
  await app.query('begin');await app.query('set local role network_copilot_app');await app.query("select set_config('app.current_user_id',$1,true)",[owner]);
  await assert.rejects(app.query('select * from agent_skill_candidate_checkpoint'),(error:unknown)=>(error as {code?:string}).code==='42501');
 }finally{await app.query('rollback');app.release();}
 const processCrash=process.env.MA24_CANDIDATE_PROCESS_CRASH==='1'?await verifySkillCandidateProcessCrashDatabase(pool,snapshot):{candidateProcessCrashRecoveryVerified:false};
 return {...processCrash,candidateGraphCheckpointDatabaseVerified:true,pendingCheckpointRecoveryReusesModelJournal:true,terminalCheckpointNoModelReplay:true,
  checkpointStaleOwnerAndRevisionWritesRejected:true,checkpointBindingAndTamperRejected:true,checkpointAppAndCrossAccountHidden:true,
  checkpointDelayedOldClaimRejected:true,
  syntheticFixture:true,actualModelCalls:0,productionAgentEquivalent:false};
}
