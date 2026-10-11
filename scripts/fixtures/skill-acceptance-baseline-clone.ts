import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {importSkill} from '../../src/lib/assistant/main/skills';
import {prepareSkillAcceptanceBaseline,validateStoredSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';

/** Only invoked by the isolated synthetic recorded-model-source verifier. */
export async function verifyAcceptanceBaselineFixture(pool:Pool,owner:string,other:string,runId:string){
 const database=(await pool.query('select current_database() as name')).rows[0].name;
 assert(/^ma11_replay_[a-f0-9]{12}$/.test(database));
 const context={userId:owner},prepared=await prepareSkillAcceptanceBaseline(context,{runId}),projection=prepared.projection;
 assert.equal(prepared.baselineJournalVerified,true);assert.equal(prepared.automaticActivation,false);
 assert(!JSON.stringify(prepared).includes('Synthetic original task'));assert(!JSON.stringify(prepared).includes('Synthetic preference'));
 const skill=await importSkill({...context,role:'member'},{name:'Acceptance baseline fixture',source:'synthetic-fixture',files:{'SKILL.md':'Use registered evidence.'},dependencies:[]});
 try{
  const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skill.id])).rows[0];
  const pin={ownerId:owner,skillId:skill.id,version:1,contentHash:version.content_hash,sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})};
  const identity={runtimeHash:digest('synthetic'),promptHash:digest('synthetic'),toolSchemaHash:projection.requests[0].toolSchemaHash,modelConfigHash:projection.modelConfigHash,scopeHash:digest('synthetic')};
  const at=(offset:number)=>new Date(Date.now()+offset).toISOString();
  const plan={protocol:'skill-acceptance-plan-v1',pin,identity,frozenAt:at(-10000),expiresAt:at(3600000),
   cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:category==='replay'?projection.inputHash:digest(category),sourceHash:category==='replay'?prepared.projectionHash:digest(category),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
  const baseline={state:'completed',stopReason:null,answerHash:projection.answerHash,evidenceHash:projection.evidenceHash,modelReceiptHashes:projection.modelReceiptHashes,
   requestedModel:projection.requests[0].requestedModel,actualModel:projection.requests[0].response.model,provider:projection.requests[0].response.provider,identity,unexpectedEffects:0};
  const observation={caseId:'replay',planHash:digest(plan),pin,inputHash:projection.inputHash,sourceHash:prepared.projectionHash,provenance:'historical-task',
   capturedAt:at(-9000),taskStartedAt:at(-9000),completedAt:at(-8000),sourceCurrent:true,baseline,candidate:{...baseline,state:'pending'}};
  const artifact={sourceKind:'synthetic-fixture',plan,observations:[observation],rawReceipts:{baselineSources:{replay:{runId,projectionHash:prepared.projectionHash}}}};
  async function persist(value:typeof artifact){
   const id=randomUUID();await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
    values($1,$2,$3,1,$4,$5,$6,$7,$8)`,[id,owner,skill.id,value.sourceKind,JSON.stringify(value.plan),JSON.stringify(value.observations),JSON.stringify(value.rawReceipts),digest(value)]);return id;
  }
  const bundleId=await persist(artifact),input={bundleId,caseId:'replay'};
  const bound=await validateStoredSkillAcceptanceBaseline(context,input);
  assert.equal(bound.baselineJournalVerified,true);assert.equal(bound.candidateVerified,false);assert.equal(bound.collectorProvenanceVerified,false);assert.equal(bound.automaticActivation,false);
  await assert.rejects(validateStoredSkillAcceptanceBaseline({userId:other},input),/unavailable/);
  for(const key of ['answerHash','evidenceHash','requestedModel'] as const){
   const changed=structuredClone(artifact);changed.observations[0].baseline[key]=key==='requestedModel'?'wrong/model':digest('changed');
   await assert.rejects(validateStoredSkillAcceptanceBaseline(context,{...input,bundleId:await persist(changed)}),/does not match|do not match/);
  }
  const missing=structuredClone(artifact);missing.rawReceipts.baselineSources.replay.runId=randomUUID();
  await assert.rejects(validateStoredSkillAcceptanceBaseline(context,{...input,bundleId:await persist(missing)}),/unavailable/);
  const changedSource=structuredClone(artifact);changedSource.rawReceipts.baselineSources.replay.projectionHash=digest('changed');
  await assert.rejects(validateStoredSkillAcceptanceBaseline(context,{...input,bundleId:await persist(changedSource)}),/source changed/);
  await pool.query("update assistant_message set content='Changed original' where user_id=$1 and metadata->>'runId'=$2",[owner,runId]);
  await assert.rejects(validateStoredSkillAcceptanceBaseline(context,input),/original user message changed/);
  await pool.query("update assistant_message set content='Synthetic original task' where user_id=$1 and metadata->>'runId'=$2",[owner,runId]);
  return {storedBaselineBound:true,changedAnswerEvidenceAndModelRejected:true,wrongTaskAndProjectionRejected:true,crossAccountBaselineRejected:true,changedOriginalRejected:true,hashOnlyProjection:true,candidateVerified:false,automaticActivation:false};
 }finally{
  const client=await pool.connect();try{
   await client.query('begin');await client.query('set local session_replication_role=replica');
   await client.query('delete from agent_skill_acceptance_bundle where owner_id=$1 and skill_id=$2',[owner,skill.id]);
   await client.query('delete from agent_skill_version where skill_id=$1',[skill.id]);await client.query('delete from agent_skill where id=$1 and owner_id=$2',[skill.id,owner]);
   await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
}
