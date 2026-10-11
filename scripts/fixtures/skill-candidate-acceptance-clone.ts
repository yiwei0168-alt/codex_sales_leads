import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {readSkillAcceptanceReviewCase,readSkillAcceptanceReview,listSkillAcceptanceReviews} from '../../src/lib/assistant/main/skill-acceptance-review';
import {digest} from '../../src/lib/assistant/main/contracts';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {validateStoredSkillAcceptanceCandidate} from '../../src/lib/assistant/main/skill-acceptance-candidate';
import type {auditDurableSkillCandidate} from '../../src/lib/assistant/main/skill-candidate-audit';
import {collectHistoricalSkillAcceptance} from '../../src/lib/assistant/main/skill-acceptance-collector';
import type {SkillCollectorTransaction} from '../../src/lib/assistant/main/skill-model-journal';
import {prepareSkillExecutionIdentity} from '../../src/lib/assistant/main/skill-runtime-identity';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../../src/lib/assistant/main/skill-acceptance-freeze';
import {readSkillAcceptanceEvidence,appendSkillAcceptanceJudgment} from '../../src/lib/assistant/main/skill-acceptance-store';

export async function prepareFrozenCandidateFixture(pool:Pool,owner:string,runId:string,skillId:string,transaction:SkillCollectorTransaction){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const baseline=await prepareSkillAcceptanceBaseline({userId:owner},{runId}),p=baseline.projection;
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skillId])).rows[0];
 const pin={ownerId:owner,skillId,version:1,contentHash:version.content_hash,sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})};
 const identity=await prepareSkillExecutionIdentity({userId:owner},{runId});
 const at=(offset:number)=>new Date(Date.now()+offset).toISOString();
 const plan={protocol:'skill-acceptance-plan-v1',pin,identity,expiresAt:at(3600000),cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:category==='replay'?p.inputHash:digest(category),sourceHash:category==='replay'?baseline.projectionHash:digest(category),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 return freezeSkillAcceptancePlan({userId:owner},plan,transaction);
}

export async function verifyCandidateAcceptanceFixture(pool:Pool,owner:string,runId:string,skillId:string,audited:Awaited<ReturnType<typeof auditDurableSkillCandidate>>,frozen:Awaited<ReturnType<typeof prepareFrozenCandidateFixture>>){
 const baseline=await prepareSkillAcceptanceBaseline({userId:owner},{runId}),p=baseline.projection,c=audited.projection;
 const {plan,freezeId}=frozen,{pin,identity}=plan;
 const base={state:'completed',stopReason:null,unexpectedEffects:0,identity,answerHash:p.answerHash,evidenceHash:p.evidenceHash,modelReceiptHashes:p.modelReceiptHashes,requestedModel:p.requests[0].requestedModel,actualModel:p.requests[0].response.model,provider:p.requests[0].response.provider,
  routing:{protocol:'per-decision-v2',decisions:p.requests.map((request,step)=>({step,requestedModel:request.requestedModel,actualModel:request.response.model,provider:request.response.provider,receiptHash:p.modelReceiptHashes[step],toolSchemaHash:request.toolSchemaHash}))}};
 const candidate={...base,answerHash:c.answerHash,evidenceHash:c.evidenceHash,modelReceiptHashes:c.modelAttemptReceipts.map(row=>row.hash),requestedModel:c.selectedModels[0].requestedModel,actualModel:c.selectedModels[0].model,provider:c.selectedModels[0].provider,
  routing:{protocol:'per-decision-v2',decisions:c.selectedModels.map(route=>({step:route.step,requestedModel:route.requestedModel,actualModel:route.model,provider:route.provider,receiptHash:route.receiptHash,toolSchemaHash:route.toolSchemaHash}))}};
 const observation={caseId:'replay',planHash:digest(plan),pin,inputHash:p.inputHash,sourceHash:baseline.projectionHash,provenance:'historical-task',capturedAt:c.capturedAt,taskStartedAt:null,completedAt:c.completedAt,sourceCurrent:true,baseline:base,candidate};
 const artifact={sourceKind:'synthetic-fixture',plan,observations:[observation],rawReceipts:{baselineSources:{replay:{runId,projectionHash:baseline.projectionHash}},candidateSources:{replay:{runId,evaluationId:c.evaluationId,projectionHash:audited.projectionHash}}}};
 const id=randomUUID();let collectedId:string|undefined;
 try{
  await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash) values($1,$2,$3,1,$4,$5,$6,$7,$8)`,[id,owner,skillId,artifact.sourceKind,JSON.stringify(plan),JSON.stringify(artifact.observations),JSON.stringify(artifact.rawReceipts),digest(artifact)]);
  const out=await validateStoredSkillAcceptanceCandidate({userId:owner},{bundleId:id,caseId:'replay'});
  assert.equal(out.candidateJournalVerified,true);assert.equal(out.baselineJournalVerified,true);assert.equal(out.automaticActivation,false);assert.equal(out.collectorProvenanceVerified,false);
  const transaction:SkillCollectorTransaction=async(userId,work)=>{const client=await pool.connect();try{
   await client.query('begin');await client.query('set local role network_copilot_skill_collector');await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
   const value=await work(client);await client.query('commit');return value;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}};
  const collection={plan,freezeId,replays:[{caseId:'replay',runId,evaluationId:c.evaluationId}]};
  await assert.rejects(collectHistoricalSkillAcceptance({userId:owner},{...collection,observations:[observation]},transaction));
  await assert.rejects(collectHistoricalSkillAcceptance({userId:randomUUID()},collection,transaction),/Acceptance freeze unavailable/);
  await assert.rejects(collectHistoricalSkillAcceptance({userId:owner},{...collection,replays:[...collection.replays,...collection.replays]},transaction),/owner or case binding/);
  const collected=await collectHistoricalSkillAcceptance({userId:owner},collection,transaction);collectedId=collected.bundleId;
  const stored=await readSkillAcceptanceEvidence({userId:owner},collected.bundleId);
  assert.equal(stored.artifact.sourceKind,'synthetic-fixture');assert.equal(stored.artifact.observations[0].candidate.answerHash,c.answerHash);
  assert.equal(stored.artifact.observations[0].capturedAt,c.capturedAt);assert.equal(stored.artifact.observations[0].completedAt,c.completedAt);
  assert.equal(stored.artifact.observations[0].taskStartedAt,null);assert.equal(stored.collectorProvenanceVerified,false);
  assert.equal((stored.artifact.rawReceipts.collector as {freezeVerified:boolean}).freezeVerified,true);
  assert.equal((stored.artifact.rawReceipts.collector as {sourceIdentityChecked:boolean}).sourceIdentityChecked,true);
  assert(Date.parse(c.capturedAt)>=Date.parse(plan.frozenAt));
  assert.equal(collected.automaticActivation,false);
  assert.equal(stored.freezeStatus.state,'active');
  const summary=await readSkillAcceptanceReview({userId:owner},collected.bundleId);assert.equal(summary.cases.filter(row=>row.materialAvailable).length,1);
  assert((await listSkillAcceptanceReviews({userId:owner},{skillId,offset:0})).items.some(row=>row.id===collected.bundleId));
  assert.equal((await listSkillAcceptanceReviews({userId:randomUUID()},{skillId,offset:0})).items.length,0);
  const material=await readSkillAcceptanceReviewCase({userId:owner},{bundleId:collected.bundleId,caseId:'replay'});
  assert.equal(material.question,'Synthetic original task');assert.equal(digest(material.baseline),p.answerHash);assert.equal(digest(material.candidate),c.answerHash);
  assert(!('messages' in material));assert(!('rawReceipts' in material));
  const review={bundleId:collected.bundleId,artifactHash:stored.artifactHash,expectedRevision:0,judgment:{caseId:'replay',observationHash:digest(stored.artifact.observations[0]),revoked:false,baseline:{answer:false,citation:false,permission:true,injection:true},candidate:{answer:false,citation:false,permission:true,injection:true},rationale:'Synthetic lifecycle test; no quality approval.'}};
  const reviewer={userId:owner,reviewerKind:'assistant-development' as const};
  await appendSkillAcceptanceJudgment(reviewer,review);
  await revokeSkillAcceptanceFreeze({userId:owner},{freezeId,reason:'Synthetic review invalidation'});
  const historical=await readSkillAcceptanceEvidence({userId:owner},collected.bundleId);
  assert.equal(historical.freezeStatus.state,'revoked');assert.equal(historical.judgments.length,1);
  await assert.rejects(validateStoredSkillAcceptanceCandidate({userId:owner},{bundleId:collected.bundleId,caseId:'replay'}),/freeze no longer active/);
  await assert.rejects(appendSkillAcceptanceJudgment(reviewer,{...review,expectedRevision:1}),/freeze no longer active/);
  const revoked=await appendSkillAcceptanceJudgment(reviewer,{...review,expectedRevision:1,judgment:{...review.judgment,revoked:true}});assert.equal(revoked.revision,2);

  return {reviewMaterialReconstructed:true,reviewListTenantIsolation:true,reviewSummaryMissingCasesNotAvailable:true,revokedHistoryReadable:true,revokedCandidateValidationRejected:true,revokedFreezeNewReviewRejected:true,reviewRevocationStillAllowed:true,storedCandidateAndBaselineBound:true,restrictedCollectorPublishedDerivedObservation:true,serverTimesPreserved:true,freezeBeforeExecutionVerified:true,sourceIdentityChecked:true,runtimeAttestation:false,perDecisionRoutesBound:true,mixedCandidateRoutes:new Set(c.selectedModels.map(row=>row.model)).size>1,syntheticBundle:true,automaticActivation:false};
 }finally{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local session_replication_role=replica');await client.query('delete from agent_skill_acceptance_judgment where bundle_id=any($1::uuid[]) and owner_id=$2',[[id,...(collectedId?[collectedId]:[])],owner]);await client.query('delete from agent_skill_acceptance_bundle where id=any($1::uuid[]) and owner_id=$2',[[id,...(collectedId?[collectedId]:[])],owner]);await client.query('commit');}
  catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
