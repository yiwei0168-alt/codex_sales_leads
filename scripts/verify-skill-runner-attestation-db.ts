import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
import {freezeSkillAcceptancePlan,revokeSkillAcceptanceFreeze} from '../src/lib/assistant/main/skill-acceptance-freeze';
import {appendSkillRunnerAttestation,readSkillRunnerAttestation} from '../src/lib/assistant/main/skill-runner-attestation-store';
import type {SkillCollectorTransaction} from '../src/lib/assistant/main/skill-model-journal';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import {verifyLockedEvidenceDatabase} from './fixtures/skill-locked-evidence-db';
import {tenantTransaction} from '../src/lib/rag/db';
import {readLockedSkillAcceptanceEvidence} from '../src/lib/assistant/main/skill-acceptance-store';

nextEnv.loadEnvConfig(process.cwd());disableLocalAnalysisTracing();
assert.equal(process.env.MA24_DISPOSABLE_RUNNER_ATTESTATION,'1','Dedicated disposable-cluster harness required');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),appUrl=new URL(process.env.DATABASE_URL!);
assert(['127.0.0.1','localhost'].includes(adminUrl.hostname));
assert.equal(`${appUrl.host}${appUrl.pathname}`,`${adminUrl.host}${adminUrl.pathname}`);
const pool=new Pool({connectionString:adminUrl.toString()});
const directory=await mkdtemp(join(tmpdir(),'skill-runner-store-test-'));
const owner=randomUUID(),other=randomUUID(),hash=digest('synthetic-store'),pair=generateKeyPairSync('ed25519');
const collector:SkillCollectorTransaction=async(userId,work)=>{
 const client=await pool.connect();try{await client.query('begin');await client.query('set local role network_copilot_skill_collector');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
  const value=await work(client);await client.query('commit');return value;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1,'Fresh placeholder-only database required');
 await pool.query(await readFile('db/migrations/148_skill_decision_memory_source_locks.sql','utf8'));
 await pool.query(await readFile('db/migrations/141_skill_runner_attestation.sql','utf8'));
 await pool.query(await readFile('db/migrations/141_skill_runner_attestation.sql','utf8'));
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic runner attestation','member','active')",[id,`${id}@example.invalid`]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic runner test',source:'synthetic-test',files:{'SKILL.md':'Synthetic instructions only.'},dependencies:[]});
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[skill.id])).rows[0];
 const draft={protocol:'skill-acceptance-plan-v1',pin:{ownerId:owner,skillId:skill.id,version:1,contentHash:version.content_hash,
  sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})},
  identity:{runtimeHash:hash,promptHash:hash,toolSchemaHash:hash,modelConfigHash:hash,scopeHash:hash},expiresAt:new Date(Date.now()+3600000).toISOString(),
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:hash,sourceHash:hash,
   provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))};
 const frozen=await freezeSkillAcceptancePlan({userId:owner},draft,collector);
 const capturedAt=new Date().toISOString(),item=frozen.plan.cases[0];
 const arm={state:'completed',stopReason:null,answerHash:hash,evidenceHash:hash,modelReceiptHashes:[hash],requestedModel:'synthetic',actualModel:'synthetic',provider:'synthetic',identity:frozen.plan.identity,unexpectedEffects:0};
 const observation={caseId:item.id,planHash:digest(frozen.plan),pin:frozen.plan.pin,inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,
  capturedAt,completedAt:capturedAt,taskStartedAt:null,sourceCurrent:true,baseline:arm,candidate:arm};
 const artifact={sourceKind:'production-runner-pending-verification',plan:frozen.plan,observations:[observation],
  rawReceipts:{collector:{freezeId:frozen.freezeId}}};
 const bundleId=randomUUID();
 await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
  values($1,$2,$3,1,$4,$5,$8,$6,$7)`,[bundleId,owner,skill.id,artifact.sourceKind,JSON.stringify(artifact.plan),JSON.stringify(artifact.rawReceipts),digest(artifact),JSON.stringify(artifact.observations)]);
 const registry={protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'test-only',collectorId:'synthetic-test-collector',deploymentHash:hash,
  publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,
  notBefore:new Date(Date.now()-60000).toISOString(),expiresAt:draft.expiresAt}]};
 const registryPath=join(directory,'public-registry.json');await writeFile(registryPath,JSON.stringify(registry));
 process.env.SKILL_RUNNER_TRUST_REGISTRY_FILE=registryPath;
 process.env.SKILL_RUNNER_DEPLOYMENT_SHA256=hash;process.env.SKILL_RUNNER_COLLECTOR_ID='synthetic-test-collector';
 const statement={protocol:'skill-runner-attestation-v1',keyId:'test-only',collectorId:'synthetic-test-collector',deploymentHash:hash,
  ownerId:owner,freezeId:frozen.freezeId,planHash:digest(frozen.plan),artifactHash:digest(artifact),runtimeIdentityHash:digest(frozen.plan.identity),
  capturedAt,completedAt:capturedAt,issuedAt:new Date().toISOString(),expiresAt:draft.expiresAt};
 const envelope={statement,signature:sign(null,Buffer.from(digest(statement),'hex'),pair.privateKey).toString('base64url')};
 const input={bundleId,envelope};
 const lockedEvidence=await verifyLockedEvidenceDatabase(pool,owner,other,bundleId);
 const emptyArtifact={...artifact,observations:[]},emptyBundle=randomUUID();
 await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
  values($1,$2,$3,1,$4,$5,'[]',$6,$7)`,[emptyBundle,owner,skill.id,emptyArtifact.sourceKind,JSON.stringify(emptyArtifact.plan),JSON.stringify(emptyArtifact.rawReceipts),digest(emptyArtifact)]);
 const emptyStatement={...statement,artifactHash:digest(emptyArtifact)};
 await assert.rejects(appendSkillRunnerAttestation({userId:owner},{bundleId:emptyBundle,envelope:{statement:emptyStatement,
  signature:sign(null,Buffer.from(digest(emptyStatement),'hex'),pair.privateKey).toString('base64url')}},collector));
 const historicalEmpty={statement:emptyStatement,signature:sign(null,Buffer.from(digest(emptyStatement),'hex'),pair.privateKey).toString('base64url')};
 const historicalEmptyId=(await pool.query(`insert into agent_skill_runner_attestation(owner_id,bundle_id,freeze_id,artifact_hash,statement_hash,envelope)
  values($1,$2,$3,$4,$5,$6) returning id`,[owner,emptyBundle,frozen.freezeId,digest(emptyArtifact),digest(emptyStatement),JSON.stringify(historicalEmpty)])).rows[0].id;
 await assert.rejects(readSkillRunnerAttestation({userId:owner},historicalEmptyId));
 const drift={...statement,capturedAt:new Date(Date.parse(capturedAt)+1).toISOString(),completedAt:new Date(Date.parse(capturedAt)+1).toISOString(),issuedAt:new Date(Date.now()+2).toISOString()};
 // Allow signing time to elapse while retaining valid statement ordering.
 await new Promise(done=>setTimeout(done,5));
 await assert.rejects(appendSkillRunnerAttestation({userId:owner},{bundleId,envelope:{statement:drift,signature:sign(null,Buffer.from(digest(drift),'hex'),pair.privateKey).toString('base64url')}},collector),/observation time binding/);
 const historicalDrift={statement:drift,signature:sign(null,Buffer.from(digest(drift),'hex'),pair.privateKey).toString('base64url')};
 const historicalDriftId=(await pool.query(`insert into agent_skill_runner_attestation(owner_id,bundle_id,freeze_id,artifact_hash,statement_hash,envelope)
  values($1,$2,$3,$4,$5,$6) returning id`,[owner,bundleId,frozen.freezeId,digest(artifact),digest(drift),JSON.stringify(historicalDrift)])).rows[0].id;
 await assert.rejects(readSkillRunnerAttestation({userId:owner},historicalDriftId),/observation time binding/);
 const saved=await appendSkillRunnerAttestation({userId:owner},input,collector);
 assert.equal((await appendSkillRunnerAttestation({userId:owner},input,collector)).id,saved.id);
 assert.equal((await readSkillRunnerAttestation({userId:owner},saved.id)).signedDeclarationVerified,true);
 await assert.rejects(readSkillRunnerAttestation({userId:other},saved.id),/unavailable/);
 await assert.rejects(appendSkillRunnerAttestation({userId:other},input,collector),/pending production/);
 await assert.rejects(appendSkillRunnerAttestation({userId:owner},{bundleId,envelope:{...envelope,statement:{...statement,artifactHash:digest('changed')}}},collector),/binding/);
 const client=await pool.connect();try{
  await client.query('begin');await client.query('set local role network_copilot_app');
  await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
  await assert.rejects(client.query(`insert into agent_skill_runner_attestation(owner_id,bundle_id,freeze_id,artifact_hash,statement_hash,envelope)
   values($1,$2,$3,$4,$5,$6)`,[owner,bundleId,frozen.freezeId,digest(artifact),digest(statement),JSON.stringify(envelope)]),/permission denied/);
 }finally{await client.query('rollback');client.release();}
 await assert.rejects(pool.query('update agent_skill_runner_attestation set artifact_hash=$2 where id=$1',[saved.id,hash]),/append-only/);
 await assert.rejects(pool.query('delete from agent_skill_runner_attestation where id=$1',[saved.id]),/append-only/);
 const syntheticArtifact={...artifact,sourceKind:'synthetic-fixture'},syntheticBundle=randomUUID();
 await pool.query(`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
  values($1,$2,$3,1,$4,$5,$8,$6,$7)`,[syntheticBundle,owner,skill.id,syntheticArtifact.sourceKind,JSON.stringify(syntheticArtifact.plan),JSON.stringify(syntheticArtifact.rawReceipts),digest(syntheticArtifact),JSON.stringify(syntheticArtifact.observations)]);
 const syntheticStatement={...statement,artifactHash:digest(syntheticArtifact)};
 await assert.rejects(appendSkillRunnerAttestation({userId:owner},{bundleId:syntheticBundle,envelope:{statement:syntheticStatement,
  signature:sign(null,Buffer.from(digest(syntheticStatement),'hex'),pair.privateKey).toString('base64url')}},collector),/pending production/);
 registry.keys[0].enabled=false;await writeFile(registryPath,JSON.stringify(registry));
 await assert.rejects(readSkillRunnerAttestation({userId:owner},saved.id),/unavailable/);
 registry.keys[0].enabled=true;await writeFile(registryPath,JSON.stringify(registry));
 await revokeSkillAcceptanceFreeze({userId:owner},{freezeId:frozen.freezeId,reason:'Synthetic revocation'});
 await assert.rejects(tenantTransaction(owner,client=>readLockedSkillAcceptanceEvidence(client,{userId:owner},bundleId)),/active recorded freeze/);
 await assert.rejects(readSkillRunnerAttestation({userId:owner},saved.id),/inactive/);
 assert.equal((await pool.query('select enabled from agent_skill where id=$1',[skill.id])).rows[0].enabled,false);
 assert.equal((await pool.query("select to_regclass('public.ma24_evaluation_hard_limit') is null absent")).rows[0].absent,true);
 console.log(JSON.stringify({runnerAttestationStore:'passed',collectorAppendAndIdempotency:true,...lockedEvidence,lockedReadRevokedFreezeRejected:true,
  emptyObservationAndSignedTimeDriftRejected:true,
  historicalUnboundStatementsRejectedOnRead:true,
  appInsertDenied:true,crossAccountDenied:true,appendOnly:true,signedSyntheticEvidenceRejected:true,keyDisablementAndFreezeRevocationRejected:true,
  deferredEvaluationMigrationsApplied:false,productionKeysCreated:false,automaticActivation:false,modelCalls:0}));
}finally{
 await pool.end();await getPool().end();await rm(directory,{recursive:true,force:true});
}
