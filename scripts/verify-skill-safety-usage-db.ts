import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {freezeSkillAcceptancePlan} from '../src/lib/assistant/main/skill-acceptance-freeze';
import {prepareSkillExecutionIdentity} from '../src/lib/assistant/main/skill-runtime-identity';
import {runDurableSkillSafetyArm} from '../src/lib/assistant/main/skill-safety-candidate';
import {auditSkillSafetyArm} from '../src/lib/assistant/main/skill-safety-audit';
import {collectSkillSafetyAcceptance} from '../src/lib/assistant/main/skill-safety-collector';
import {readSkillAcceptanceReviewCase} from '../src/lib/assistant/main/skill-acceptance-review';
import {modelFunctions,transportMessages} from '../src/lib/assistant/main/model';
import {modelRequestManifest} from '../src/lib/assistant/main/model-request-manifest';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import type {SkillCandidateRequest} from '../src/lib/assistant/main/skill-candidate-model';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {prepareCompositionDatabaseFixture} from './fixtures/skill-composition-database';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_SAFETY_USAGE,'1','Dedicated disposable-cluster harness required');
const app=new URL(process.env.DATABASE_URL!),admin=new URL(process.env.DATABASE_MIGRATION_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for safety usage fixture');};
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID();
const transaction:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{
  await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);const out=await work(client);
  await client.query('commit');return out;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic safety usage','member','active')",[owner,`${owner}@example.invalid`]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic safety usage',source:'synthetic-test',files:{'SKILL.md':'Read and respect account evidence.'},dependencies:[]});
 const prepared=await prepareCompositionDatabaseFixture({pool,owner,skillId:skill.id,config:modeModelConfig('standard'),memory:decisionMemoryMessage([])});
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skill.id])).rows[0];
 const frozen=await freezeSkillAcceptancePlan({userId:owner},{protocol:'skill-acceptance-plan-v1',
  pin:{ownerId:owner,skillId:skill.id,version:1,contentHash:version.content_hash,sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})},
  identity:await prepareSkillExecutionIdentity({userId:owner},{runId:prepared.runId}),expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:[...prepared.cases,{id:'unexecuted-shadow',category:'shadow',provenance:'prospective-task',inputHash:digest('unused'),sourceHash:digest('unused')}],
 },transaction);
 let calls=0;
 const request=(load:boolean):SkillCandidateRequest=>async input=>{
  calls++;const tool=load&&input.step<2;
  const message=tool?{role:'assistant',content:null,tool_calls:[{id:`synthetic-usage-${input.step}`,type:'function',function:{name:input.step===0?'describe_tool':'execute_tool',
   arguments:JSON.stringify(input.step===0?{tool:'skill_read'}:{tool:'skill_read',arguments:{id:skill.id}})}}]}:{role:'assistant',content:'Synthetic answer claims to follow the Skill; no real quality approval.'};
  const route=input.profile.routes[input.index],body={model:route.model,messages:transportMessages(input.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`synthetic-safety-usage-${calls}`})};
 };
 const selection={runId:prepared.runId,skillId:skill.id,version:1,caseId:'safety-ambiguous'};
 const badId=randomUUID();
 for(const arm of ['baseline','candidate'] as const){
  const out=await runDurableSkillSafetyArm({userId:owner},selection,arm,{frozen,evaluationId:badId,sourceKind:'synthetic-fixture',transaction,request:request(false)});
  assert.equal(out.status,'completed');assert.equal(out.candidateSkillUsed,false);
 }
 await assert.rejects(auditSkillSafetyArm({userId:owner},{...selection,evaluationId:badId,arm:'candidate'},frozen),/did not read the fixed Skill/);
 await assert.rejects(collectSkillSafetyAcceptance({userId:owner},{freezeId:frozen.freezeId,plan:frozen.plan,cases:[{caseId:selection.caseId,runId:prepared.runId,evaluationId:badId}]},transaction),/did not read the fixed Skill/);
 assert.equal((await pool.query('select count(*)::int n from agent_skill_acceptance_bundle where owner_id=$1',[owner])).rows[0].n,0);
 const goodId=randomUUID();
 for(const arm of ['baseline','candidate'] as const){
  const out=await runDurableSkillSafetyArm({userId:owner},selection,arm,{frozen,evaluationId:goodId,sourceKind:'synthetic-fixture',transaction,request:request(arm==='candidate')});
  assert.equal(out.status,'completed');assert.equal(out.candidateSkillUsed,arm==='candidate');
 }
 assert.equal((await auditSkillSafetyArm({userId:owner},{...selection,evaluationId:goodId,arm:'candidate'},frozen)).candidateSkillUsed,true);
 const collected=await collectSkillSafetyAcceptance({userId:owner},{freezeId:frozen.freezeId,plan:frozen.plan,cases:[{caseId:selection.caseId,runId:prepared.runId,evaluationId:goodId}]},transaction);
 const material=await readSkillAcceptanceReviewCase({userId:owner},{bundleId:collected.bundleId,caseId:selection.caseId});
 assert.equal(material.automaticActivation,false);assert.equal(material.judgment,null);
 assert.equal((await pool.query('select count(*)::int n from agent_skill_acceptance_bundle where owner_id=$1',[owner])).rows[0].n,1);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 assert.equal(calls,6);
 console.log(JSON.stringify({safetySkillUsageDatabase:'passed',unloadedCompletedCandidateRejected:true,collectorDoesNotAppendUnloadedCandidate:true,
  loadedCandidateCollectAndUnifiedRead:true,baselineWithoutCandidateReadAllowed:true,scriptedModelCalls:calls,realQualityApproval:false,modelCalls:0,automaticActivation:false}));
}finally{await pool.end();await getPool().end();}
