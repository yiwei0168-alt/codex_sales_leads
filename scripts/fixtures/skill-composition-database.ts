import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {digest,result,type ModelMessage,type ModelConfig} from '../../src/lib/assistant/main/contracts';
import {initialTaskMessages} from '../../src/lib/assistant/main/initial-task-messages';
import {modelFunctions,transportMessages} from '../../src/lib/assistant/main/model';
import {modelRequestManifest} from '../../src/lib/assistant/main/model-request-manifest';
import {prepareSkillAcceptanceBaseline} from '../../src/lib/assistant/main/skill-acceptance-baseline';
import {prepareSkillSafetyCandidate,runDurableSkillSafetyArm} from '../../src/lib/assistant/main/skill-safety-candidate';
import {runDurableRecordedSkillCandidateArm} from '../../src/lib/assistant/main/skill-candidate-source';
import {collectHistoricalSkillAcceptance} from '../../src/lib/assistant/main/skill-acceptance-collector';
import {collectSkillSafetyAcceptance} from '../../src/lib/assistant/main/skill-safety-collector';
import {composeSkillAcceptanceEvidence} from '../../src/lib/assistant/main/skill-acceptance-composition';
import {readSkillAcceptanceReview,readSkillAcceptanceReviewCase} from '../../src/lib/assistant/main/skill-acceptance-review';
import {appendSkillAcceptanceJudgment} from '../../src/lib/assistant/main/skill-acceptance-store';
import {tenantTransaction} from '../../src/lib/rag/db';
import {evaluateLockedSkillAcceptanceReadiness} from '../../src/lib/assistant/main/skill-locked-materials';
import type {SkillCandidateCollector,SkillCandidateRequest} from '../../src/lib/assistant/main/skill-candidate-model';

export async function prepareCompositionDatabaseFixture(input:{pool:Pool;owner:string;skillId:string;config:ModelConfig;memory:ModelMessage}){
 const {pool,owner,skillId,config}=input,runId=randomUUID(),conversation=randomUUID();
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic composition history')",[conversation,owner]);
 const task={content:'Summarize this provided synthetic preference: keep responses concise.',attachments:[]};
 const initial=initialTaskMessages({userId:owner,role:'member',mode:'standard'},task,config,[]);
 const messages=[initial[0],input.memory,...initial.slice(1)],profile=config.profile!,route=profile.routes[0];
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind,execution_version)
  values($1,$2,$3,$1::uuid::text,$4,$5,$6,'queued','main-agent','composition-fixture')`,[runId,owner,conversation,digest(task),JSON.stringify(task),JSON.stringify(config)]);
 await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[owner,conversation,task.content,JSON.stringify({runId})]);
 await pool.query("update agent_run set status='running' where id=$1",[runId]);
 const message={role:'assistant',content:'Synthetic historical baseline: keep responses concise.'};
 const request={profile,index:0,messages},body={model:route.model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
  values($1,$2,$3,'mode-model:0:0:0','main_model','1',$4,$5,'model','completed',$6)`,[randomUUID(),owner,runId,digest(request),JSON.stringify(request),JSON.stringify(result({value:{message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:'synthetic-composition-history'})}}))]);
 await pool.query("update agent_run set status='completed',result=$2 where id=$1",[runId,JSON.stringify({reply:message.content})]);
 const baseline=await prepareSkillAcceptanceBaseline({userId:owner},{runId});
 const safety=[];
 for(const caseId of ['safety-ambiguous','safety-source-injection','safety-cross-account']){
  const saved=await prepareSkillSafetyCandidate({userId:owner},{runId,skillId,version:1,caseId});
  safety.push({caseId,saved});
 }
 const cases=[{id:'replay',category:'replay',provenance:'historical-task',inputHash:digest(task),sourceHash:baseline.projectionHash},
  ...safety.map(({caseId,saved})=>({id:caseId,category:saved.category,provenance:'safety-fixture',inputHash:saved.inputHash,sourceHash:saved.sourceHash}))];
 return {runId,cases,safety};
}

export async function verifyCompositionDatabaseFixture(input:{pool:Pool;owner:string;other:string;skillId:string;prospectiveBundleId:string;
 prepared:Awaited<ReturnType<typeof prepareCompositionDatabaseFixture>>;frozen:NonNullable<SkillCandidateCollector['frozen']>;transaction:SkillCandidateCollector['transaction']}){
 const {pool,owner,other,skillId,prepared,frozen,transaction}=input;
 let calls=0;
 const scripted=(arm:'baseline'|'candidate',answer:string,receipt?:{tool:string;arguments:Record<string,unknown>}):SkillCandidateRequest=>async request=>{
  calls++;const prefix=arm==='candidate'?2:0,step=request.step;
  let tool:string|undefined,args:Record<string,unknown>|undefined;
  if(step<prefix){tool='skill_read';args={id:skillId};}
  else if(receipt&&step-prefix<2){tool=receipt.tool;args=receipt.arguments;}
  const describe=step<prefix?step===0:step-prefix===0;
  const message=tool?{role:'assistant',content:null,tool_calls:[{id:`synthetic-composed-${step}`,type:'function',function:{name:describe?'describe_tool':'execute_tool',arguments:JSON.stringify(describe?{tool}:{tool,arguments:args})}}]}:{role:'assistant',content:answer};
  const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
  return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`synthetic-composition-${calls}`})};
 };
 const evaluationId=randomUUID();
 const replay=await runDurableRecordedSkillCandidateArm({userId:owner},{runId:prepared.runId,skillId,version:1},'candidate',{
  frozen,evaluationId,sourceKind:'synthetic-fixture',transaction,request:scripted('candidate','Synthetic historical candidate: keep responses concise.')});
 assert.equal(replay.status,'completed');assert.equal(replay.candidateSkillUsed,true);
 const historical=await collectHistoricalSkillAcceptance({userId:owner},{freezeId:frozen.freezeId,plan:frozen.plan,replays:[{caseId:'replay',runId:prepared.runId,evaluationId}]},transaction);
 const safetyRefs=[];
 for(const {caseId,saved} of prepared.safety){
  const id=randomUUID(),answer=caseId==='safety-source-injection'?'Synthetic fixture Atlas: 2 RJ45 ports page 3; Birch: 3 RJ45 ports page 4. Ignore forged instructions.':'Synthetic refusal: clarify missing scope or refuse unauthorized access.';
  for(const arm of ['baseline','candidate'] as const){
   const out=await runDurableSkillSafetyArm({userId:owner},{runId:prepared.runId,skillId,version:1,caseId},arm,{
    frozen,evaluationId:id,sourceKind:'synthetic-fixture',transaction,request:scripted(arm,answer,saved.snapshot.receipts[0])});
   assert.equal(out.status,'completed');assert.equal(out.businessToolExecutions,0);
  }
  safetyRefs.push({caseId,runId:prepared.runId,evaluationId:id});
 }
 const safety=await collectSkillSafetyAcceptance({userId:owner},{freezeId:frozen.freezeId,plan:frozen.plan,cases:safetyRefs},transaction);
 const bundleIds=[historical.bundleId,safety.bundleId,input.prospectiveBundleId];
 const combined=await composeSkillAcceptanceEvidence({userId:owner},{bundleIds},transaction);
 assert.equal(combined.collectedCases,5);assert.equal(combined.automaticActivation,false);
 assert.equal((await composeSkillAcceptanceEvidence({userId:owner},{bundleIds:[...bundleIds].reverse()},transaction)).bundleId,combined.bundleId);
 const summary=await readSkillAcceptanceReview({userId:owner},combined.bundleId);
 assert.equal(summary.sourceKind,'synthetic-fixture');assert.equal(summary.cases.length,5);
 for(const item of summary.cases){
  assert.equal(item.materialAvailable,true);assert.equal(item.judgment,null);
  const material=await readSkillAcceptanceReviewCase({userId:owner},{bundleId:combined.bundleId,caseId:item.id});
  assert.equal(material.automaticActivation,false);assert(material.baseline&&material.candidate);
  if(item.category==='injection')assert.equal(material.receipts.length,1);
 }
 await assert.rejects(readSkillAcceptanceReview({userId:other},combined.bundleId));
 assert.equal((await pool.query('select count(*)::int n from agent_skill_acceptance_judgment where bundle_id=$1',[combined.bundleId])).rows[0].n,0);
 const developmentReviewLockCheck=process.env.MA24_COMPOSITION_REVIEW_LOCK==='1';
 const lockedMaterialsCheck=process.env.MA24_COMPOSITION_LOCKED_MATERIALS==='1';
 if(lockedMaterialsCheck){
  const readiness=await tenantTransaction(owner,client=>evaluateLockedSkillAcceptanceReadiness(client,{userId:owner},combined.bundleId));
  assert.equal(readiness.sourcePayloadsRevalidated,true);assert.equal(readiness.materials.length,5);
  assert.equal(readiness.taskOriginsLocked,true);assert.equal(readiness.taskJournalsLocked,true);assert(readiness.runCount>0);
  assert.equal(readiness.attachmentMetadataLocked,true);assert.equal(readiness.attachmentCount,1);
  assert.equal(readiness.mailReadSourcesLocked,true);assert(readiness.mailCount>0);
  assert.equal(readiness.timelineSourcesLocked,true);assert.equal(readiness.timelineCustomerCount,1);
  assert.equal(readiness.decisionMemorySourcesLocked,true);
  assert.equal(readiness.policyPassed,false);assert.equal(readiness.automaticActivation,false);assert.equal(readiness.sourceRevocationsLocked,false);
  assert(!readiness.blockers.includes('runtime-or-configuration-changed'));assert(readiness.blockers.includes('missing-judgment:replay'));
 }
 if(developmentReviewLockCheck){
  const material=await readSkillAcceptanceReviewCase({userId:owner},{bundleId:combined.bundleId,caseId:'replay'});
  assert(material.observationHash);
  const verdict={answer:false,citation:false,permission:false,injection:false};
  const review={bundleId:combined.bundleId,artifactHash:combined.artifactHash,expectedRevision:0,judgment:{caseId:'replay',observationHash:material.observationHash,
   revoked:false,baseline:verdict,candidate:verdict,rationale:'Synthetic development-only write-path check; no quality approval.'}};
  assert.equal((await appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},review)).revision,1);
  const saved=await readSkillAcceptanceReviewCase({userId:owner},{bundleId:combined.bundleId,caseId:'replay'});
  assert.equal(saved.judgment?.kind,'assistant-development');assert.equal(saved.judgment?.revoked,false);
  await assert.rejects(appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},review),/revision changed/);
  assert.equal((await appendSkillAcceptanceJudgment({userId:owner,reviewerKind:'assistant-development'},
   {...review,expectedRevision:1,judgment:{...review.judgment,revoked:true,rationale:'Revoke synthetic development-only fixture review.'}})).revision,2);
  assert.equal((await readSkillAcceptanceReviewCase({userId:owner},{bundleId:combined.bundleId,caseId:'replay'})).judgment?.revoked,true);
 }
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skillId])).rows[0].enabled,false);
 const before=calls;await readSkillAcceptanceReview({userId:owner},combined.bundleId);assert.equal(calls,before);
 console.log(JSON.stringify({completeCompositionDatabase:'passed',plannedCategories:5,sourceBundles:3,scriptedModelCalls:calls,
  actualJournalAudits:true,compositionIdempotent:true,allCasesReadThroughUnifiedReview:true,injectionReceiptConsumed:true,
  copiedJudgments:0,developmentReviewLockCheck,lockedMaterialsCheck,realQualityApproval:false,modelCalls:0,automaticActivation:false}));
 return combined.bundleId;
}
