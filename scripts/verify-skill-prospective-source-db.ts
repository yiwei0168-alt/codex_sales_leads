import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest,result,type ModelMessage} from '../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {importSkill} from '../src/lib/assistant/main/skills';
import {prepareShadowRegistration} from '../src/lib/assistant/main/skill-shadow';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../src/lib/assistant/main/skill-acceptance-freeze';
import {prepareSkillProspectiveSource} from '../src/lib/assistant/main/skill-prospective-source';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {encryptMailboxContent} from '../src/lib/mailbox/crypto';
import {getMailboxMessageForReview} from '../src/lib/mailbox/repository';
import {readCustomerTimeline,listMailboxCustomers} from '../src/lib/mailbox/customer-timeline';
import {initialTaskMessages} from '../src/lib/assistant/main/initial-task-messages';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {loadDecisionMemory} from '../src/lib/assistant/main/memory-context';
import {modelFunctions,transportMessages} from '../src/lib/assistant/main/model';
import {modelRequestManifest} from '../src/lib/assistant/main/model-request-manifest';
import {describeTool,productTools} from '../src/lib/assistant/main/tools';
import {skillSourceRuntimeHash} from '../src/lib/assistant/main/skill-runtime-identity';
import {runDurableRecordedSkillCandidateArm} from '../src/lib/assistant/main/skill-candidate-source';
import {collectSkillProspectiveAcceptance} from '../src/lib/assistant/main/skill-prospective-collector';
import {readSkillAcceptanceReview,readSkillAcceptanceReviewCase} from '../src/lib/assistant/main/skill-acceptance-review';
import {verifySkillProspectiveHttp} from './verify-skill-prospective-http';
import {composeSkillAcceptanceEvidence} from '../src/lib/assistant/main/skill-acceptance-composition';
import {prepareCompositionDatabaseFixture,verifyCompositionDatabaseFixture} from './fixtures/skill-composition-database';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_PROSPECTIVE_SOURCE,'1','Dedicated disposable-cluster harness required');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);
assert(['127.0.0.1','localhost'].includes(adminUrl.hostname));
assert.equal(`${appUrl.host}${appUrl.pathname}`,`${adminUrl.host}${adminUrl.pathname}`);
process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('HTTP disabled for prospective source fixture');};
const pool=new Pool({connectionString:adminUrl.toString()});
const owner=randomUUID(),other=randomUUID(),conversation=randomUUID(),campaign=randomUUID(),run=randomUUID();
const connection=randomUUID(),mail=randomUUID(),modelCall=randomUUID(),readCall=randomUUID();
const fullMaterial=process.env.MA24_PROSPECTIVE_FULL_MATERIAL==='1';
const fullComposition=process.env.MA24_PROSPECTIVE_COMPOSITION==='1';
assert(!fullComposition||fullMaterial,'Composition requires full paired material');
const collector:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);const value=await work(client);
  await client.query('commit');return value;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1,'Fresh placeholder-only database required');
 if(process.env.MA24_COMPOSITION_LOCKED_MATERIALS==='1'){
  await pool.query(await readFile('db/migrations/144_skill_task_origin_locks.sql','utf8'));
  await pool.query(await readFile('db/migrations/145_skill_attachment_source_locks.sql','utf8'));
  await pool.query(await readFile('db/migrations/146_skill_model_freeze_serialization.sql','utf8'));
  await pool.query(await readFile('db/migrations/147_skill_timeline_source_locks.sql','utf8'));
  await pool.query(await readFile('db/migrations/148_skill_decision_memory_source_locks.sql','utf8'));
  await pool.query(await readFile('db/migrations/149_skill_knowledge_source_locks.sql','utf8'));
 }
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic prospective source','member','active')",[id,`${id}@example.invalid`]);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic prospective source')",[conversation,owner]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic prospective source',source:'synthetic-test',files:{'SKILL.md':'Read and cite the recorded account evidence.'},dependencies:[]});
 const registration=await prepareShadowRegistration(owner,{skillId:skill.id,version:1,hours:1,selection:{kind:'whole-read-only-task'}});
 await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
  values($1,$2,$3,1,$4,$5,$6,true,clock_timestamp()+interval '1 hour')`,[campaign,owner,skill.id,registration.contentHash,registration.sourceHash,JSON.stringify(registration.config)]);
 const attachmentId=randomUUID();
 if(fullComposition){
  const documentId=randomUUID(),treeId=randomUUID(),sha=digest('Synthetic composition attachment');
  const collectionId=(await pool.query('select id from knowledge_collection order by id limit 1')).rows[0].id;
  await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
   values($1,$2,$1::uuid::text,'Synthetic composition attachment','synthetic',$3,$4,'private')`,[documentId,collectionId,sha,owner]);
  await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
   values($1,$2,'synthetic/composition.txt',$3,'text/plain',0,'text','synthetic')`,[attachmentId,documentId,sha]);
  await pool.query(`insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status)
   values($1,$2,$3,$4,'synthetic',$4,'ready')`,[treeId,documentId,attachmentId,sha]);
  await pool.query('update knowledge_document set current_tree_version_id=$1 where id=$2',[treeId,documentId]);
 }
 const task={content:'Read the synthetic mailbox message and summarize its single stated preference.',attachments:fullComposition?[{assetId:attachmentId}]:[]},config=modeModelConfig('standard');
 const initial=initialTaskMessages({userId:owner,role:'member',mode:'standard'},task,config,[]);
 const initialWithMemory:ModelMessage[]=[initial[0],decisionMemoryMessage(await loadDecisionMemory(owner)),...initial.slice(1)];
 const composition=fullComposition?await prepareCompositionDatabaseFixture({pool,owner,skillId:skill.id,config,memory:initialWithMemory[1]}):undefined;
 const sqlHash=async(value:unknown)=>(await pool.query('select skill_shadow_json_hash($1::jsonb) as hash',[JSON.stringify(value)])).rows[0].hash as string;
 const requestHash=digest(task);
 const start={kind:'prospective-server-capture',campaignId:campaign,skillId:skill.id,version:1,
  contentHash:registration.contentHash,sourceHash:registration.sourceHash,config:registration.config,
  inputHash:await sqlHash(task),modelConfigHash:await sqlHash(config),requestHash,createdRunStatus:'queued'};
 const hash=digest('synthetic');
 const draft={protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,
  contentHash:registration.contentHash,sourceHash:registration.sourceHash},
  identity:{runtimeHash:fullMaterial?await skillSourceRuntimeHash():hash,
   promptHash:fullMaterial?digest(initialWithMemory.filter((row,index)=>row.role==='system'&&index!==1)):hash,
   toolSchemaHash:fullMaterial?digest(modelFunctions):hash,modelConfigHash:digest(config),
   scopeHash:fullMaterial?digest({userId:owner,role:'member',mode:'standard',knowledgeScope:null}):hash},
  expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:composition?[...composition.cases,{id:'shadow',category:'shadow',inputHash:digest(task),sourceHash:digest(start),provenance:'prospective-task'}]:
   ['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,
    inputHash:digest(task),sourceHash:digest(start),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 const frozen=await freezeSkillAcceptancePlan({userId:owner},draft,collector);
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind,execution_version)
  values($1,$2,$3,$1::uuid::text,$4,$5,$6,'queued','main-agent','prospective-source-fixture')`,[run,owner,conversation,requestHash,JSON.stringify(task),JSON.stringify(config)]);
 await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[owner,conversation,task.content,JSON.stringify({runId:run})]);
 const capture=(await pool.query('select * from agent_skill_shadow_job where owner_id=$1 and run_id=$2',[owner,run])).rows[0];
 assert(capture);assert.equal(digest(capture.start_context),digest(start));
 await pool.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic source','unusable-synthetic')",[connection,owner,`${owner}@example.invalid`]);
 const content=encryptMailboxContent(owner,{subject:'Synthetic preference',bodyText:'Please keep responses concise.',sender:['sender@example.invalid'],recipients:['recipient@example.invalid']});
 await pool.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext)
  values($1,$2,$3,'INBOX','synthetic',1,'inbound',$4,$5)`,[mail,owner,connection,hash,content]);
 const mailData=await getMailboxMessageForReview(owner,mail);assert(mailData);
 const customerId=randomUUID(),timelineCall=randomUUID(),customerListCall=randomUUID();
 let timelineData:Awaited<ReturnType<typeof readCustomerTimeline>>=null;
 let customerListData:Awaited<ReturnType<typeof listMailboxCustomers>>|undefined;
 if(fullComposition){
  await pool.query("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$1::uuid::text,'Synthetic composition customer')",[customerId,owner]);
  await pool.query('insert into mailbox_customer_message(user_id,customer_id,message_id) values($1,$2,$3)',[owner,customerId,mail]);
  timelineData=await readCustomerTimeline(owner,customerId);assert(timelineData);assert.equal(timelineData.events.length,1);
  customerListData=await listMailboxCustomers(owner);assert.equal(customerListData.items.length,1);
 }
 const writeCall=async(id:string,tool:string,effect:string,args:unknown,output:unknown,key=id)=>{
  const normalized=effect==='read'?productTools.find(item=>item.id===tool)!.input.parse(args):args;
  return pool.query(`insert into agent_tool_call
  (id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
  values($1,$2,$3,$9,$4,'1',$5,$6,$7,'completed',$8)`,[id,owner,run,tool,digest(normalized),JSON.stringify(normalized),effect,JSON.stringify(output),key]);
 };
 await pool.query("update agent_run set status='running' where id=$1",[run]);
 const baselineAnswer='Synthetic baseline: Please keep responses concise.';
 if(fullMaterial){
  const messages:ModelMessage[]=structuredClone(initialWithMemory),profile=config.profile!,route=profile.routes[0];
  const replies:ModelMessage[]=[{role:'assistant',content:null,tool_calls:[{id:'source-describe-mail',type:'function',function:{name:'describe_tool',arguments:JSON.stringify({tool:'mail_read'})}}]},
   {role:'assistant',content:null,tool_calls:[{id:'source-mail-read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'mail_read',arguments:{messageId:mail}})}}]},
   {role:'assistant',content:baselineAnswer}];
  if(fullComposition){
   replies[0].tool_calls!.push({id:'source-describe-timeline',type:'function',function:{name:'describe_tool',arguments:JSON.stringify({tool:'customer_timeline'})}});
   replies[1].tool_calls!.push(
    {id:'source-timeline-read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'customer_timeline',arguments:{customerId}})}},
    {id:'source-customer-list',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool:'customer_timeline',arguments:{}})}});
  }
  for(const [step,message] of replies.entries()){
   const request={profile,index:0,messages:structuredClone(messages)},body={model:route.model,messages:transportMessages(messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
   await writeCall(randomUUID(),'main_model','model',request,result({value:{message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`synthetic-source-${step}`})}}),`mode-model:${step}:0:0`);
   messages.push(message);
   if(step===0)messages.push({role:'tool',tool_call_id:'source-describe-mail',content:JSON.stringify({status:'success',data:describeTool(productTools.find(tool=>tool.id==='mail_read')!)})});
   if(step===0&&fullComposition)messages.push({role:'tool',tool_call_id:'source-describe-timeline',content:JSON.stringify({status:'success',data:describeTool(productTools.find(tool=>tool.id==='customer_timeline')!)})});
   if(step===1){const output=result(mailData,{callId:readCall});await writeCall(readCall,'mail_read','read',{messageId:mail},output,'source-mail-read');
    messages.push({role:'tool',tool_call_id:'source-mail-read',content:JSON.stringify(output)});
    if(fullComposition)for(const [callId,key,args,data] of [[timelineCall,'source-timeline-read',{customerId},timelineData],[customerListCall,'source-customer-list',{},customerListData]] as const){
     const timelineOutput=result(data,{callId});await writeCall(callId,'customer_timeline','read',args,timelineOutput,key);
     messages.push({role:'tool',tool_call_id:key,content:JSON.stringify(timelineOutput)});
    }
   }
  }
 }else{
  await writeCall(modelCall,'main_model','model',{synthetic:true},result({synthetic:true}));
  await writeCall(readCall,'mail_read','read',{messageId:mail},result(mailData));
 }
 await pool.query("update agent_run set status='completed',result=$2 where id=$1",[run,JSON.stringify({reply:fullMaterial?baselineAnswer:'Synthetic source fixture only.'})]);
 const params={jobId:capture.id,freezeId:frozen.freezeId,caseId:'shadow',plan:frozen.plan};
 const verified=await prepareSkillProspectiveSource({userId:owner},params);
 assert.equal(verified.prospectiveCaptureVerified,true);assert.equal(verified.localComparisonPromoted,false);
 assert.equal(verified.projection.runId,run);
 let collectedBundle:string|undefined;
 let composedBundle:string|undefined;
 if(fullMaterial){
  const evaluationId=randomUUID(),candidateAnswer='Synthetic candidate: Please keep responses concise.';
  let requests=0;
  const actions=[{name:'describe_tool',args:{tool:'skill_read'}},{name:'execute_tool',args:{tool:'skill_read',arguments:{id:skill.id}}},
   {name:'describe_tool',args:{tool:'mail_read'}},{name:'execute_tool',args:{tool:'mail_read',arguments:{messageId:mail}}},
   ...(fullComposition?[{name:'describe_tool',args:{tool:'customer_timeline'}},{name:'execute_tool',args:{tool:'customer_timeline',arguments:{customerId}}},
    {name:'execute_tool',args:{tool:'customer_timeline',arguments:{}}}]:[])];
  const executed=await runDurableRecordedSkillCandidateArm({userId:owner},{runId:run,skillId:skill.id,version:1},'candidate',{
   frozen,evaluationId,sourceKind:'synthetic-fixture',transaction:collector,request:async request=>{
    requests++;const step=request.step;
    const action=actions[step];
    const message=action?{role:'assistant',content:null,tool_calls:[{id:`synthetic-candidate-${step}`,type:'function',function:{name:action.name,arguments:JSON.stringify(action.args)}}]}:
     {role:'assistant',content:candidateAnswer};
    const route=request.profile.routes[request.index],body={model:route.model,messages:transportMessages(request.messages),tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
    return {message,requestManifest:modelRequestManifest(body,{model:route.model,provider:'synthetic',id:`synthetic-candidate-${step}`})};
   }});
  assert.equal(executed.status,'completed');assert.equal(executed.candidateSkillUsed,true);assert.equal(requests,actions.length+1);
  const selection={freezeId:frozen.freezeId,plan:frozen.plan,cases:[{caseId:'shadow',jobId:capture.id,evaluationId}]};
  const collected=await collectSkillProspectiveAcceptance({userId:owner},selection,collector);collectedBundle=collected.bundleId;
  assert.equal((await collectSkillProspectiveAcceptance({userId:owner},selection,collector)).bundleId,collectedBundle);
  assert.equal((await readSkillAcceptanceReview({userId:owner},collectedBundle)).cases.find(row=>row.id==='shadow')?.materialAvailable,true);
  const material=await readSkillAcceptanceReviewCase({userId:owner},{bundleId:collectedBundle,caseId:'shadow'});
  assert.equal(material.baseline,baselineAnswer);assert.equal(material.candidate,candidateAnswer);assert.equal(material.receipts.length,fullComposition?3:1);
  assert.equal(material.automaticActivation,false);assert.equal(requests,actions.length+1);
  await assert.rejects(readSkillAcceptanceReviewCase({userId:other},{bundleId:collectedBundle,caseId:'shadow'}));
  const bundleCount=(await pool.query('select count(*)::int n from agent_skill_acceptance_bundle where owner_id=$1',[owner])).rows[0].n;
  await assert.rejects(composeSkillAcceptanceEvidence({userId:owner},{bundleIds:[collectedBundle]},collector),/missing planned cases/);
  assert.equal((await pool.query('select count(*)::int n from agent_skill_acceptance_bundle where owner_id=$1',[owner])).rows[0].n,bundleCount);
  if(composition)composedBundle=await verifyCompositionDatabaseFixture({pool,owner,other,skillId:skill.id,prospectiveBundleId:collectedBundle,prepared:composition,frozen,transaction:collector});
  if(process.env.MA24_PROSPECTIVE_HTTP==='1')await verifySkillProspectiveHttp(pool,{owner,other,bundleId:composedBundle??collectedBundle,skillId:skill.id,baseline:baselineAnswer,candidate:candidateAnswer},nativeFetch);
 }
 await assert.rejects(prepareSkillProspectiveSource({userId:other},params),/owner/);
 const late=await freezeSkillAcceptancePlan({userId:owner},draft,collector);
 await assert.rejects(prepareSkillProspectiveSource({userId:owner},{...params,freezeId:late.freezeId,plan:late.plan}),/frozen before/);
 await pool.query("update mailbox_message set metadata=jsonb_set(metadata,'{rawContentPurged}','true') where id=$1",[mail]);
 await assert.rejects(prepareSkillProspectiveSource({userId:owner},params),/Private replay source unavailable/);
 if(collectedBundle)await assert.rejects(readSkillAcceptanceReviewCase({userId:owner},{bundleId:collectedBundle,caseId:'shadow'}));
 if(composedBundle)await assert.rejects(readSkillAcceptanceReviewCase({userId:owner},{bundleId:composedBundle,caseId:'shadow'}));
 await pool.query("update mailbox_message set metadata=metadata-'rawContentPurged' where id=$1",[mail]);
 assert.equal((await prepareSkillProspectiveSource({userId:owner},params)).projectionHash,verified.projectionHash);
 await revokeSkillAcceptanceFreeze({userId:owner},{freezeId:frozen.freezeId,reason:'Synthetic source revocation'});
 await assert.rejects(prepareSkillProspectiveSource({userId:owner},params),/revoked/);
 if(composedBundle)await assert.rejects(readSkillAcceptanceReviewCase({userId:owner},{bundleId:composedBundle,caseId:'shadow'}));
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 console.log(JSON.stringify({prospectiveSourceDatabase:'passed',serverTriggerCapture:true,preTaskFreezeBinding:true,
  realMailboxReceiptRevalidation:true,lateFreezeAndPurgedSourceRejected:true,crossAccountAndRevocationRejected:true,
  fullPairedMaterialVerified:fullMaterial,completeCompositionVerified:fullComposition,localComparisonPromoted:false,automaticActivation:false,modelCalls:0,externalCalls:0}));
}finally{await pool.end();await getPool().end();}
