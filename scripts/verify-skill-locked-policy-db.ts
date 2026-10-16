import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {prepareSkillExecutionIdentity} from '../src/lib/assistant/main/skill-runtime-identity';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../src/lib/assistant/main/skill-acceptance-freeze';
import {appendSkillAcceptanceJudgment} from '../src/lib/assistant/main/skill-acceptance-store';
import {evaluateLockedSkillAcceptancePolicy} from '../src/lib/assistant/main/skill-locked-acceptance-policy';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {prepareCompositionDatabaseFixture} from './fixtures/skill-composition-database';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_LOCKED_POLICY,'1','Disposable cluster harness required');
process.env.PGOPTIONS='-c statement_timeout=15000';
const app=new URL(process.env.DATABASE_URL!),admin=new URL(process.env.DATABASE_MIGRATION_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for locked policy fixture');};
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),bundleId=randomUUID();
const transaction:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);const out=await work(client);await client.query('commit');return out;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic locked policy','member','active')",[id,`${id}@example.invalid`]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic locked policy',source:'synthetic-test',files:{'SKILL.md':'Synthetic locked policy instructions.'},dependencies:[]});
 const config=modeModelConfig('standard'),prepared=await prepareCompositionDatabaseFixture({pool,owner,skillId:skill.id,config,memory:decisionMemoryMessage([])});
 const identity=await prepareSkillExecutionIdentity({userId:owner},{runId:prepared.runId});
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skill.id])).rows[0];
 const frozen=await freezeSkillAcceptancePlan({userId:owner},{protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,contentHash:version.content_hash,
  sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})},identity,expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:[...prepared.cases,{id:'shadow',category:'shadow',provenance:'prospective-task',inputHash:digest('synthetic shadow'),sourceHash:digest('synthetic capture')}],
 },transaction);
 const route=config.profile!.routes[0],time=new Date().toISOString(),hash=digest('synthetic');
 const arm={state:'completed',stopReason:null,answerHash:hash,evidenceHash:hash,modelReceiptHashes:[hash],requestedModel:route.model,
  actualModel:route.model,provider:'synthetic-fixture',identity,unexpectedEffects:0};
 const observations=frozen.plan.cases.map(item=>({caseId:item.id,planHash:digest(frozen.plan),pin:frozen.plan.pin,inputHash:item.inputHash,sourceHash:item.sourceHash,
  provenance:item.provenance,capturedAt:time,taskStartedAt:time,completedAt:time,sourceCurrent:true,baseline:arm,candidate:arm}));
 // These are synthetic policy projections, not collected production arm material.
 const reference={runId:prepared.runId},rawReceipts={collector:{freezeId:frozen.freezeId},baselineSources:{replay:reference},candidateSources:{replay:reference},
  safetySources:Object.fromEntries(prepared.cases.filter(item=>item.provenance==='safety-fixture').map(item=>[item.id,reference])),prospectiveSources:{shadow:reference}};
 const artifact={sourceKind:'synthetic-fixture',plan:frozen.plan,observations,rawReceipts};
 await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
  values($1,$2,$3,1,$4,$5,$6,$7,$8)`,[bundleId,owner,skill.id,artifact.sourceKind,JSON.stringify(artifact.plan),JSON.stringify(observations),JSON.stringify(rawReceipts),digest(artifact)]);
 const evaluate=()=>tenantTransaction(owner,client=>evaluateLockedSkillAcceptancePolicy(client,{userId:owner},bundleId));
 const initial=await evaluate();assert.equal(initial.lockedEvidencePolicyEvaluated,true);assert.equal(initial.policyPassed,false);
 assert(initial.blockers.includes('missing-judgment:replay'));assert(!initial.blockers.includes('runtime-or-configuration-changed'));
 assert.equal(initial.currentRuntimeIdentityHash,digest(identity));assert.equal(initial.automaticActivation,false);
 const verdict={answer:false,citation:false,permission:false,injection:false},observation=observations.find(row=>row.caseId==='replay')!;
 const review={bundleId,artifactHash:digest(artifact),expectedRevision:0,judgment:{caseId:'replay',observationHash:digest(observation),revoked:false,
  baseline:verdict,candidate:verdict,rationale:'Synthetic development-only policy check; no quality approval.'}};
 await appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},review);
 const reviewed=await evaluate();assert(reviewed.blockers.includes('unaccepted-judgment:replay'));assert.notEqual(reviewed.latestReviewHash,initial.latestReviewHash);
 await appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},
  {...review,expectedRevision:1,judgment:{...review.judgment,revoked:true,rationale:'Revoke synthetic development-only policy check.'}});
 const revoked=await evaluate();assert.equal(revoked.policyPassed,false);assert.notEqual(revoked.latestReviewHash,reviewed.latestReviewHash);
 await assert.rejects(tenantTransaction(other,client=>evaluateLockedSkillAcceptancePolicy(client,{userId:other},bundleId)),/unavailable/);
 await revokeSkillAcceptanceFreeze({userId:owner},{freezeId:frozen.freezeId,reason:'Synthetic policy fixture completed'});
 await assert.rejects(evaluate(),/active recorded freeze/);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 console.log(JSON.stringify({lockedPolicyDatabase:'passed',actualServerIdentityReconstruction:true,actualLockedPolicyAndDatabaseClock:true,
  missingAndDevelopmentReviewsRejected:true,latestRevocationChangesReviewHash:true,crossAccountAndFreezeRevocationRejected:true,
  syntheticPolicyProjections:true,fullSourcePayloadReconstruction:false,actualModelCalls:0,humanApprovalCreated:false,automaticActivation:false}));
}finally{await pool.end();await getPool().end();}
