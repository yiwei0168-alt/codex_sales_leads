import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {modelFunctions} from '../src/lib/assistant/main/model';
import {modelRequestManifest} from '../src/lib/assistant/main/model-request-manifest';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../src/lib/assistant/main/skill-acceptance-freeze';
import {createSkillModelJournal,type SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {readSkillCandidateJournal} from '../src/lib/assistant/main/skill-candidate-audit';
import {skillTransportResponseHash} from '../src/lib/assistant/main/skill-model-transport-receipt';
import {verifySkillCandidateJournalTransports} from '../src/lib/assistant/main/skill-model-transport-journal';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1','Dedicated disposable cluster required');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for synthetic transport journal fixture');};
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),evaluationId=randomUUID();
const directory=await mkdtemp(join(tmpdir(),'ma24-transport-journal-')),registryPath=join(directory,'public-registry.json');
const transaction:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);const value=await work(client);await client.query('commit');return value;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1,'Fresh placeholder-only database required');
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic transport fixture','member','active')",[id,`${id}@example.invalid`]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic transport fixture',source:'synthetic-test',files:{'SKILL.md':'Synthetic transport journal instructions.'},dependencies:[]});
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skill.id])).rows[0],hash=digest('synthetic');
 const frozen=await freezeSkillAcceptancePlan({userId:owner},{protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,contentHash:version.content_hash,
  sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})},
  identity:{runtimeHash:hash,promptHash:hash,toolSchemaHash:digest(modelFunctions),modelConfigHash:hash,scopeHash:hash},expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:hash,sourceHash:hash,
   provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))},transaction);
 const pair=generateKeyPairSync('ed25519'),deploymentHash=digest('synthetic-deployment');
 const key={keyId:'ephemeral-test-key',collectorId:'synthetic-collector',deploymentHash,publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),
  enabled:true,purposes:['model-transport'],notBefore:new Date(Date.parse(frozen.plan.frozenAt)-60000).toISOString(),expiresAt:frozen.plan.expiresAt};
 const registry={protocol:'skill-runner-trust-registry-v1',keys:[key]};
 await writeFile(registryPath,JSON.stringify(registry));process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE=registryPath;
 process.env.SKILL_RUNNER_COLLECTOR_ID=key.collectorId;process.env.SKILL_RUNNER_DEPLOYMENT_SHA256=deploymentHash;
 const input={messages:[{role:'user' as const,content:'Synthetic transport request'}],profile:modeModelConfig('quick').profile!,index:0};
 const snapshotHash=digest('synthetic-snapshot'),pin={ownerId:owner,evaluationId,arm:'candidate' as const,step:0,snapshotHash,freezeId:frozen.freezeId,
  sourceKind:'production-runner-pending-verification' as const};
 // Pending classification is exercised only in this disposable fixture. It grants no production authenticity.
 const journal=createSkillModelJournal(transaction,pin),attempt=await journal.begin(input);
 const route=input.profile.routes[0],body={model:route.model,messages:input.messages,tools:modelFunctions,stream:true,reasoning:{effort:route.effort}};
 const message={role:'assistant',content:'Synthetic signed reply'},manifest=modelRequestManifest(body,{model:route.model,provider:'synthetic-fixture',id:'synthetic-generation'});
 const capturedAt=new Date().toISOString(),statement={protocol:'skill-model-transport-v1',keyId:key.keyId,ownerId:owner,freezeId:frozen.freezeId,evaluationId,arm:pin.arm,
  planHash:digest(frozen.plan),snapshotHash,step:0,routeIndex:0,collectorId:key.collectorId,deploymentHash,requestHash:manifest.requestHash,
  manifestHash:digest(manifest),responseHash:skillTransportResponseHash(message),origin:'https://openrouter.ai',path:'/api/v1/chat/completions',status:200,
  capturedAt,completedAt:new Date().toISOString(),expiresAt:frozen.plan.expiresAt};
 const value={message,requestManifest:manifest,transportReceipt:{statement,signature:sign(null,Buffer.from(digest(statement),'hex'),pair.privateKey).toString('base64url')}};
 await journal.save(attempt.id,0,{status:'success',value});
 const selection={evaluationId,arm:pin.arm},checked=await verifySkillCandidateJournalTransports({userId:owner},selection,frozen);
 assert.equal(checked.signedSuccessfulTransportsVerified,true);assert.equal(checked.binaryVerified,false);assert.equal(checked.automaticActivation,false);
 assert.equal(checked.transportReceiptHashes.length,1);
 assert.equal((await journal.begin(input)).fresh,false);assert.equal((await journal.begin(input)).output?.status,'success');
 assert.equal(digest(await verifySkillCandidateJournalTransports({userId:owner},selection,frozen)),digest(checked));
 assert.equal((await readSkillCandidateJournal({userId:other},selection)).length,0);
 await assert.rejects(verifySkillCandidateJournalTransports({userId:other},selection,frozen),/unavailable/);
 await assert.rejects(pool.query("update agent_skill_model_outcome set output='{}' where attempt_id=$1",[attempt.id]),/append-only/);
 key.enabled=false;await writeFile(registryPath,JSON.stringify(registry));
 await assert.rejects(verifySkillCandidateJournalTransports({userId:owner},selection,frozen),/trust key unavailable/);
 key.enabled=true;await writeFile(registryPath,JSON.stringify(registry));
 await revokeSkillAcceptanceFreeze({userId:owner},{freezeId:frozen.freezeId,reason:'Synthetic transport fixture finished'});
 await assert.rejects(verifySkillCandidateJournalTransports({userId:owner},selection,frozen),/revoked/);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 console.log(JSON.stringify({transportJournalDatabase:'passed',restrictedCollectorAppend:true,persistedSignatureVerified:true,recoveryReusesStoredOutcome:true,
  crossAccountHidden:true,appendOnly:true,registryRevocationRejected:true,freezeRevocationRejected:true,syntheticFixture:true,binaryVerified:false,automaticActivation:false,actualModelCalls:0}));
}finally{await pool.end();await getPool().end();await rm(directory,{recursive:true,force:true});}
