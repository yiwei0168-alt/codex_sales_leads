import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest,result} from '../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {importSkill} from '../src/lib/assistant/main/skills';
import {prepareShadowRegistration} from '../src/lib/assistant/main/skill-shadow';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../src/lib/assistant/main/skill-acceptance-freeze';
import {prepareSkillProspectiveSource} from '../src/lib/assistant/main/skill-prospective-source';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {encryptMailboxContent} from '../src/lib/mailbox/crypto';
import {getMailboxMessageForReview} from '../src/lib/mailbox/repository';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_PROSPECTIVE_SOURCE,'1','Dedicated disposable-cluster harness required');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);
assert(['127.0.0.1','localhost'].includes(adminUrl.hostname));
assert.equal(`${appUrl.host}${appUrl.pathname}`,`${adminUrl.host}${adminUrl.pathname}`);
process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
globalThis.fetch=async()=>{throw new Error('HTTP disabled for prospective source fixture');};
const pool=new Pool({connectionString:adminUrl.toString()});
const owner=randomUUID(),other=randomUUID(),conversation=randomUUID(),campaign=randomUUID(),run=randomUUID();
const connection=randomUUID(),mail=randomUUID(),modelCall=randomUUID(),readCall=randomUUID();
const collector:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);const value=await work(client);
  await client.query('commit');return value;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1,'Fresh placeholder-only database required');
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic prospective source','member','active')",[id,`${id}@example.invalid`]);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic prospective source')",[conversation,owner]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic prospective source',source:'synthetic-test',files:{'SKILL.md':'Read and cite the recorded account evidence.'},dependencies:[]});
 const registration=await prepareShadowRegistration(owner,{skillId:skill.id,version:1,hours:1,selection:{kind:'whole-read-only-task'}});
 await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
  values($1,$2,$3,1,$4,$5,$6,true,clock_timestamp()+interval '1 hour')`,[campaign,owner,skill.id,registration.contentHash,registration.sourceHash,JSON.stringify(registration.config)]);
 const task={content:'Read the synthetic mailbox message and summarize its single stated preference.'},config=modeModelConfig('standard');
 const sqlHash=async(value:unknown)=>(await pool.query('select skill_shadow_json_hash($1::jsonb) as hash',[JSON.stringify(value)])).rows[0].hash as string;
 const requestHash=digest(task);
 const start={kind:'prospective-server-capture',campaignId:campaign,skillId:skill.id,version:1,
  contentHash:registration.contentHash,sourceHash:registration.sourceHash,config:registration.config,
  inputHash:await sqlHash(task),modelConfigHash:await sqlHash(config),requestHash,createdRunStatus:'queued'};
 const hash=digest('synthetic');
 const draft={protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,
  contentHash:registration.contentHash,sourceHash:registration.sourceHash},
  identity:{runtimeHash:hash,promptHash:hash,toolSchemaHash:hash,modelConfigHash:digest(config),scopeHash:hash},
  expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,
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
 const writeCall=async(id:string,tool:string,effect:string,args:unknown,output:unknown)=>pool.query(`insert into agent_tool_call
  (id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
  values($1,$2,$3,$1::uuid::text,$4,'1',$5,$6,$7,'completed',$8)`,[id,owner,run,tool,digest(args),JSON.stringify(args),effect,JSON.stringify(output)]);
 await pool.query("update agent_run set status='running' where id=$1",[run]);
 await writeCall(modelCall,'main_model','model',{synthetic:true},result({synthetic:true}));
 await writeCall(readCall,'mail_read','read',{messageId:mail},result(mailData));
 await pool.query("update agent_run set status='completed',result=$2 where id=$1",[run,JSON.stringify({reply:'Synthetic source fixture only.'})]);
 const params={jobId:capture.id,freezeId:frozen.freezeId,caseId:'shadow',plan:frozen.plan};
 const verified=await prepareSkillProspectiveSource({userId:owner},params);
 assert.equal(verified.prospectiveCaptureVerified,true);assert.equal(verified.localComparisonPromoted,false);
 assert.equal(verified.projection.runId,run);
 await assert.rejects(prepareSkillProspectiveSource({userId:other},params),/owner/);
 const late=await freezeSkillAcceptancePlan({userId:owner},draft,collector);
 await assert.rejects(prepareSkillProspectiveSource({userId:owner},{...params,freezeId:late.freezeId,plan:late.plan}),/frozen before/);
 await pool.query("update mailbox_message set metadata=jsonb_set(metadata,'{rawContentPurged}','true') where id=$1",[mail]);
 await assert.rejects(prepareSkillProspectiveSource({userId:owner},params),/Private replay source unavailable/);
 await pool.query("update mailbox_message set metadata=metadata-'rawContentPurged' where id=$1",[mail]);
 assert.equal((await prepareSkillProspectiveSource({userId:owner},params)).projectionHash,verified.projectionHash);
 await revokeSkillAcceptanceFreeze({userId:owner},{freezeId:frozen.freezeId,reason:'Synthetic source revocation'});
 await assert.rejects(prepareSkillProspectiveSource({userId:owner},params),/revoked/);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 console.log(JSON.stringify({prospectiveSourceDatabase:'passed',serverTriggerCapture:true,preTaskFreezeBinding:true,
  realMailboxReceiptRevalidation:true,lateFreezeAndPurgedSourceRejected:true,crossAccountAndRevocationRejected:true,
  localComparisonPromoted:false,automaticActivation:false,modelCalls:0,externalCalls:0}));
}finally{await pool.end();await getPool().end();}
