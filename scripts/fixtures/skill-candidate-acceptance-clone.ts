import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {validateStoredSkillAcceptanceCandidate} from '../../src/lib/assistant/main/skill-acceptance-candidate';
import type {auditDurableSkillCandidate} from '../../src/lib/assistant/main/skill-candidate-audit';

export async function verifyCandidateAcceptanceFixture(pool:Pool,owner:string,runId:string,skillId:string,audited:Awaited<ReturnType<typeof auditDurableSkillCandidate>>){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await pool.query('select current_database() as name')).rows[0].name));
 const baseline=await prepareSkillAcceptanceBaseline({userId:owner},{runId}),p=baseline.projection,c=audited.projection;
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skillId])).rows[0];
 const pin={ownerId:owner,skillId,version:1,contentHash:version.content_hash,sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})};
 const identity={runtimeHash:digest('synthetic'),promptHash:digest('synthetic'),toolSchemaHash:p.requests[0].toolSchemaHash,modelConfigHash:p.modelConfigHash,scopeHash:digest('synthetic')};
 const at=(offset:number)=>new Date(Date.now()+offset).toISOString();
 const plan={protocol:'skill-acceptance-plan-v1',pin,identity,frozenAt:at(-10000),expiresAt:at(3600000),cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:category==='replay'?p.inputHash:digest(category),sourceHash:category==='replay'?baseline.projectionHash:digest(category),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 const base={state:'completed',stopReason:null,unexpectedEffects:0,identity,answerHash:p.answerHash,evidenceHash:p.evidenceHash,modelReceiptHashes:p.modelReceiptHashes,requestedModel:p.requests[0].requestedModel,actualModel:p.requests[0].response.model,provider:p.requests[0].response.provider};
 const candidate={...base,answerHash:c.answerHash,evidenceHash:c.evidenceHash,modelReceiptHashes:c.modelAttemptReceipts.map(row=>row.hash),requestedModel:c.selectedModels[0].requestedModel,actualModel:c.selectedModels[0].model,provider:c.selectedModels[0].provider};
 const observation={caseId:'replay',planHash:digest(plan),pin,inputHash:p.inputHash,sourceHash:baseline.projectionHash,provenance:'historical-task',capturedAt:at(-9000),taskStartedAt:at(-9000),completedAt:at(-8000),sourceCurrent:true,baseline:base,candidate};
 const artifact={sourceKind:'synthetic-fixture',plan,observations:[observation],rawReceipts:{baselineSources:{replay:{runId,projectionHash:baseline.projectionHash}},candidateSources:{replay:{runId,evaluationId:c.evaluationId,projectionHash:audited.projectionHash}}}};
 const id=randomUUID();
 try{
  await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash) values($1,$2,$3,1,$4,$5,$6,$7,$8)`,[id,owner,skillId,artifact.sourceKind,JSON.stringify(plan),JSON.stringify(artifact.observations),JSON.stringify(artifact.rawReceipts),digest(artifact)]);
  const out=await validateStoredSkillAcceptanceCandidate({userId:owner},{bundleId:id,caseId:'replay'});
  assert.equal(out.candidateJournalVerified,true);assert.equal(out.baselineJournalVerified,true);assert.equal(out.automaticActivation,false);assert.equal(out.collectorProvenanceVerified,false);
  return {storedCandidateAndBaselineBound:true,syntheticBundle:true,automaticActivation:false};
 }finally{
  const client=await pool.connect();try{await client.query('begin');await client.query('set local session_replication_role=replica');await client.query('delete from agent_skill_acceptance_bundle where id=$1 and owner_id=$2',[id,owner]);await client.query('commit');}
  catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
