import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {tenantTransaction,withBoundTenantTransaction} from '../../src/lib/rag/db';
import {collectHistoricalSkillAcceptance} from '../../src/lib/assistant/main/skill-acceptance-collector';
import {readSkillAcceptanceReview,readSkillAcceptanceReviewCase} from '../../src/lib/assistant/main/skill-acceptance-review';
import {readSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-store';
import {lockSkillRuntimeMaterialSources} from '../../src/lib/assistant/main/skill-runtime-material-sources';
import type {SkillCandidateCollector} from '../../src/lib/assistant/main/skill-candidate-model';
import type {readCompletedSkillCandidateRuntimeTask} from '../../src/lib/assistant/main/skill-candidate-runtime-task';
import {revalidateLockedSkillPrivateReceipts} from '../../src/lib/assistant/main/skill-private-receipt-check';

export async function verifySkillRuntimeMaterialDatabase(pool:Pool,userId:string,input:Parameters<typeof readCompletedSkillCandidateRuntimeTask>[1],
 frozen:NonNullable<SkillCandidateCollector['frozen']>,transaction:SkillCandidateCollector['transaction'],candidateAnswer:string){
 const context={userId},collected=await collectHistoricalSkillAcceptance(context,{plan:frozen.plan,freezeId:frozen.freezeId,
  replays:[{caseId:input.caseId,runId:input.runId,evaluationId:input.evaluationId,taskId:input.taskId}]},transaction);
 assert.equal(collected.collectedCases,1);assert.equal(collected.automaticActivation,false);
 const review=await readSkillAcceptanceReview(context,collected.bundleId);
 assert(review.cases.find(row=>row.id===input.caseId)?.materialAvailable);assert.equal(review.sourcesCurrent,true);
 const material=await readSkillAcceptanceReviewCase(context,{bundleId:collected.bundleId,caseId:input.caseId});
 assert.equal(material.candidate,candidateAnswer);assert.equal(material.baseline,'Synthetic streamed reply');
 assert.equal(material.judgment,null);assert.equal(material.productionAgentEquivalent,false);assert.equal(material.automaticActivation,false);
 assert(material.receipts.some(row=>'arm' in row&&row.arm==='baseline'));
 assert(material.receipts.some(row=>'arm' in row&&row.arm==='candidate'&&row.tool==='skill_read'));
 const evidence=await readSkillAcceptanceEvidence(context,collected.bundleId);
 const stored=evidence.artifact.rawReceipts.candidateSources as Record<string,{taskId?:string}>;
 assert.equal(stored[input.caseId].taskId,input.taskId);
 await tenantTransaction(userId,async client=>withBoundTenantTransaction(client,userId,async()=>{
  const locked=await lockSkillRuntimeMaterialSources(client,userId,evidence.artifact);assert.equal(locked.runtimeTaskCount,1);assert(locked.runtimeTaskLedgerHash);
  const privateSources=await revalidateLockedSkillPrivateReceipts(userId,material.receipts);assert(privateSources.privateReceiptCount>=2);
  const tool=(await pool.query('select id from agent_tool_call where run_id=$1 order by id limit 1',[input.taskId])).rows[0];assert(tool);
  for(const [sql,id] of [['update agent_run set result=result where id=$1',input.taskId],['update agent_tool_call set output=output where id=$1',tool.id]]){
   const writer=await pool.connect();try{
    await writer.query('begin');await writer.query("set local lock_timeout='150ms'");
    await assert.rejects(writer.query(sql,[id]),(error:unknown)=>(error as {code?:string}).code==='55P03');
   }finally{await writer.query('rollback');writer.release();}
  }
 }));
 await assert.rejects(tenantTransaction(userId,async client=>{
  const before=await lockSkillRuntimeMaterialSources(client,userId,evidence.artifact);
  await client.query('update agent_run set result=$2 where id=$1',[input.taskId,{reply:'Synthetic fingerprint mutation rolled back'}]);
  const after=await lockSkillRuntimeMaterialSources(client,userId,evidence.artifact);
  assert.notEqual(after.runtimeTaskLedgerHash,before.runtimeTaskLedgerHash);
  throw new Error('Synthetic runtime material fingerprint rollback');
 }),/Synthetic runtime material fingerprint rollback/);
 assert.equal((await pool.query('select result from agent_run where id=$1',[input.taskId])).rows[0].result.reply,candidateAnswer);
 return {bundleId:collected.bundleId,checks:{runtimeUnifiedMaterialReviewVerified:true,runtimeMaterialTaskAndToolLocksVerified:true,
  runtimeMaterialFingerprintDetectsResultChange:true,runtimeMaterialNoHumanJudgmentCreated:true}};
}
