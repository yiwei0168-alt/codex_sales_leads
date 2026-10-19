import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {revalidateLockedSkillTransportReceipts} from '../../src/lib/assistant/main/skill-locked-transport-receipts';
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
 const task=(await pool.query<{input:{content:string;attachments:Array<{assetId:string}>}}>('select input from agent_run where id=$1 and user_id=$2',[original.runId,original.owner])).rows[0].input;
 assert.equal(task.attachments.length,1);const config=modeModelConfig('standard');
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
  // Synthetic enrolled declaration binds the actual composed artifact. It is
  // not production identity, provider evidence, or a human quality judgment.
  const registryPath=process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE!;
  const registry=JSON.parse(await readFile(registryPath,'utf8'));
  registry.keys.find((key:{keyId:string})=>key.keyId===prospective.keyId).purposes.push('runner-declaration');
  await writeFile(registryPath,JSON.stringify(registry));
  process.env.SKILL_RUNNER_COLLECTOR_ID=prospective.collectorId;process.env.SKILL_RUNNER_DEPLOYMENT_SHA256=prospective.deploymentHash;
  const declarationJob=join(prospective.directory,'combined-declaration-job.json');
  await writeFile(declarationJob,JSON.stringify({ownerId:original.owner,bundleId:combined.bundleId}));
  const declaration=await new Promise<{code:number|null;output:string}>((accept,reject)=>{
   const child=spawn(process.execPath,['tmp/skill-collector/runner.cjs','--attest',declarationJob],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
    NODE_ENV:'production',NODE_OPTIONS:'',NODE_PATH:'',SKILL_RUNNER_DECLARATION_KEY_ID:prospective.keyId,SKILL_RUNNER_DECLARATION_PRIVATE_KEY_FILE:prospective.keyPath}});
   let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});
   child.once('error',reject);child.once('exit',code=>accept({code,output}));
  });
  assert.equal(declaration.code,0,'Configured combined declaration CLI failed');
  assert.equal(JSON.parse(declaration.output.trim()).collectorDeclaration,'completed');
  const databaseTrust=process.env.MA24_DATABASE_TRUST==='1',priorRegistryMode=process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;
  if(databaseTrust){
   await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
   process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE='database';
  }
  try{
  const publisher=databaseTrust?await pool.connect():undefined;
  let publication:Promise<{error?:unknown}>|undefined;
  let readiness:Awaited<ReturnType<typeof evaluateLockedSkillAcceptanceReadiness>>;
  try{
   readiness=await tenantTransaction(original.owner,async client=>{
    const ready=await evaluateLockedSkillAcceptanceReadiness(client,context,combined.bundleId);
    if(publisher){
     const readerPid=(await client.query('select pg_backend_pid() pid')).rows[0].pid;
     const publisherPid=(await publisher.query('select pg_backend_pid() pid')).rows[0].pid;
     const disabled={...registry,keys:registry.keys.map((key:Record<string,unknown>)=>({...key,enabled:false}))};
     publication=publisher.query('select publish_skill_runner_trust_registry($1,$2)',[disabled,digest(disabled)]).then(()=>({}),error=>({error}));
     let blocked=false;
     for(let n=0;n<80;n++){
      blocked=(await pool.query('select $1::int=any(pg_blocking_pids($2)) blocked',[readerPid,publisherPid])).rows[0].blocked;
      if(blocked)break;await new Promise(done=>setTimeout(done,25));
     }
     assert(blocked,'Registry disablement must wait for the exact readiness transaction after readiness returns');
    }
    return ready;
   });
   if(publication){assert.equal((await publication).error,undefined);
    await assert.rejects(tenantTransaction(original.owner,client=>evaluateLockedSkillAcceptanceReadiness(client,context,combined.bundleId)),/trust key unavailable/);
    await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
   }
  }finally{if(publication)await publication;publisher?.release();}
  assert.equal(readiness.trustRegistryLocked,databaseTrust);
  if(databaseTrust){assert(readiness.trustRegistryRevision);assert.equal(readiness.trustRegistryHash,digest(registry));}
  assert.equal(readiness.transportReceiptsRequired,true);assert.equal(readiness.transportReceiptsRevalidated,true);
  assert.equal(readiness.transportOriginalTaskCount,2);assert.equal(readiness.transportEvaluationArmCount,8);assert(readiness.transportReceiptCount!>8);
  assert.equal(readiness.runnerDeclarationRevalidated,true);assert.equal(readiness.transportRegistryHash,readiness.runnerRegistryHash);
  assert.equal(readiness.collectorProvenanceVerified,false);
  assert.equal(readiness.attachmentBytesCount,1);assert.equal(readiness.attachmentImmutableSnapshotCount,1);
  assert.equal(readiness.attachmentReadOnlyMountVerified,false);
  const assetId=task.attachments[0].assetId;
  await pool.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[assetId]);
  try{await assert.rejects(tenantTransaction(original.owner,client=>evaluateLockedSkillAcceptanceReadiness(client,context,combined.bundleId)),/attachment|Attachment|material/);}
  finally{await pool.query("update knowledge_asset set registration_status='registered' where id=$1",[assetId]);}
  const restored=await tenantTransaction(original.owner,client=>evaluateLockedSkillAcceptanceReadiness(client,context,combined.bundleId));
  assert.equal(restored.attachmentImmutableSnapshotManifestHash,readiness.attachmentImmutableSnapshotManifestHash);
  const key=registry.keys.find((row:{keyId:string})=>row.keyId===prospective.keyId);key.enabled=false;
  try{await writeFile(registryPath,JSON.stringify(registry));
   if(databaseTrust)await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
   await assert.rejects(tenantTransaction(original.owner,client=>revalidateLockedSkillTransportReceipts(client,context,combined.bundleId)),{message:'Task failure trust unavailable'});
   if(databaseTrust)await assert.rejects(tenantTransaction(original.owner,client=>evaluateLockedSkillAcceptanceReadiness(client,context,combined.bundleId)),/trust key unavailable/);
  }finally{key.enabled=true;await writeFile(registryPath,JSON.stringify(registry));
   if(databaseTrust)await pool.query('select publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);}
  assert.equal(readiness.materials.length,5);assert.equal(readiness.policyPassed,false);assert.equal(readiness.automaticActivation,false);
  assert.equal(readiness.knowledgeSourcesLocked,true);assert.equal(readiness.decisionMemorySourcesLocked,true);assert.equal(readiness.timelineSourcesLocked,true);
  assert.equal(readiness.prospectiveCaptureSourcesLocked,true);assert.equal(readiness.prospectiveJobCount,1);
  assert(readiness.blockers.includes('missing-judgment:signed-replay'));assert.equal(readiness.sourceRevocationsLocked,false);
  assert.equal((await pool.query('select enabled from agent_skill where id=$1',[original.skillId])).rows[0].enabled,false);
  return {configuredSameFreezeFiveCategoriesVerified:true,lockedTransportReceiptsRevalidated:true,transportOriginalTaskCount:2,transportEvaluationArmCount:8,disabledTransportKeyRejected:true,collectedCases:5,combinedArtifactHash:combined.artifactHash,
   frozenPlanHash:digest(registration.frozen.plan),lockedMaterialsVerified:true,prospectiveCaptureSourcesLocked:true,missingHumanJudgmentBlocksPolicy:true,
   immutableAttachmentSnapshotVerified:true,withdrawnSnapshotSourceRejected:true,restoredCanonicalSnapshotRevalidated:true,
   databaseTrustRegistryReadinessVerified:databaseTrust,registryDisablementBlockedUntilReadinessTransactionCommit:databaseTrust,
   realQualityAccepted:false,productionQualificationGranted:false,automaticActivation:false};
  }finally{if(priorRegistryMode===undefined)delete process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE;else process.env.SKILL_RUNNER_TRUST_REGISTRY_MODE=priorRegistryMode;}
 });
}
