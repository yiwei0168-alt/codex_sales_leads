import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';
import {decisionMemoryMessage} from '../../src/lib/assistant/main/decision-memory-message';
import {loadDecisionMemory} from '../../src/lib/assistant/main/memory-context';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {prepareSkillSafetyCandidate} from '../../src/lib/assistant/main/skill-safety-candidate';
import {composeSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-composition';
import {readSkillAcceptanceReviewCase} from '../../src/lib/assistant/main/skill-acceptance-review';
import {evaluateLockedSkillAcceptanceReadiness} from '../../src/lib/assistant/main/skill-locked-materials';
import {tenantTransaction} from '../../src/lib/rag/db';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {registerSignedProspectiveFixture} from './signed-prospective-registration-db';
import {verifyConfiguredSignedCandidateDatabase} from './configured-signed-candidate-db';
import {verifyConfiguredSignedSafetyDatabase} from './configured-signed-safety-db';
import type {SignedFixtureContext} from './task-transport-journal-db';

type Registration=Awaited<ReturnType<typeof registerSignedProspectiveFixture>>;
/** One real freeze, two signed original tasks, all configured collector paths.
 * All model/network/budget adapters remain synthetic; no human approval exists. */
export async function verifyCombinedConfiguredDatabase(pool:Pool,original:SignedFixtureContext,
 createProspective:(registration:Registration,onReady:(context:SignedFixtureContext)=>Promise<Record<string,unknown>>)=>Promise<Record<string,unknown>>):Promise<Record<string,unknown>>{
 const context={userId:original.owner},baseline=await prepareSkillAcceptanceBaseline(context,{runId:original.runId});
 const otherCases:Parameters<typeof registerSignedProspectiveFixture>[1]['otherCases']=[{id:'signed-replay',category:'replay',provenance:'historical-task',inputHash:baseline.projection.inputHash,sourceHash:baseline.projectionHash}];
 for(const caseId of ['safety-ambiguous','safety-source-injection','safety-cross-account']){
  const saved=await prepareSkillSafetyCandidate(context,{runId:original.runId,skillId:original.skillId,version:1,caseId});
  otherCases.push({id:caseId,category:saved.category,provenance:'safety-fixture',inputHash:saved.inputHash,sourceHash:saved.sourceHash});
 }
 const task={content:'Synthetic stored request',attachments:[] as []},config=modeModelConfig('standard');
 const initial=initialTaskMessages({userId:original.owner,role:'member',mode:'standard'},task,config,[]);
 const messages=[initial[0],decisionMemoryMessage(await loadDecisionMemory(original.owner)),...initial.slice(1)];
 const registration=await registerSignedProspectiveFixture(pool,{owner:original.owner,skillId:original.skillId,task,config,messages,otherCases});
 return createProspective(registration,async prospective=>{
  const capture=(await pool.query<{id:string}>('select id from agent_skill_shadow_job where owner_id=$1 and run_id=$2',[prospective.owner,prospective.runId])).rows[0];assert(capture);
  const shadow=await verifyConfiguredSignedCandidateDatabase(pool,{...prospective,prospective:{jobId:capture.id,frozen:registration.frozen}});
  const historical=await verifyConfiguredSignedCandidateDatabase(pool,{...prospective,runId:original.runId,frozenOverride:registration.frozen});
  const safety=await verifyConfiguredSignedSafetyDatabase(pool,{...prospective,runId:original.runId,frozenOverride:registration.frozen});
  const transaction:SkillCollectorTransaction=async(owner,work)=>{
   const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
    const value=await work(client);await client.query('commit');return value;
   }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  };
  const combined=await composeSkillAcceptanceEvidence(context,{bundleIds:[historical.collectorBundleId,safety.collectorBundleId,shadow.collectorBundleId]},transaction);
  assert.equal(combined.collectedCases,5);assert.equal(combined.requiresNewHumanReview,true);
  for(const item of registration.frozen.plan.cases){
   const material=await readSkillAcceptanceReviewCase(context,{bundleId:combined.bundleId,caseId:item.id});
   assert.equal(material.judgment,null);assert.equal(material.canPass.baseline,true);assert.equal(material.canPass.candidate,true);assert.equal(material.automaticActivation,false);
  }
  const readiness=await tenantTransaction(original.owner,client=>evaluateLockedSkillAcceptanceReadiness(client,context,combined.bundleId));
  assert.equal(readiness.materials.length,5);assert.equal(readiness.policyPassed,false);assert.equal(readiness.automaticActivation,false);
  assert.equal(readiness.knowledgeSourcesLocked,true);assert.equal(readiness.decisionMemorySourcesLocked,true);assert.equal(readiness.timelineSourcesLocked,true);
  assert.equal(readiness.prospectiveCaptureSourcesLocked,true);assert.equal(readiness.prospectiveJobCount,1);
  assert(readiness.blockers.includes('missing-judgment:signed-replay'));assert.equal(readiness.sourceRevocationsLocked,false);
  assert.equal((await pool.query('select enabled from agent_skill where id=$1',[original.skillId])).rows[0].enabled,false);
  return {configuredSameFreezeFiveCategoriesVerified:true,collectedCases:5,combinedArtifactHash:combined.artifactHash,
   frozenPlanHash:digest(registration.frozen.plan),lockedMaterialsVerified:true,prospectiveCaptureSourcesLocked:true,missingHumanJudgmentBlocksPolicy:true,
   realQualityAccepted:false,productionQualificationGranted:false,automaticActivation:false};
 });
}
