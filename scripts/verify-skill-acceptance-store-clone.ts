import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill,changeSkill} from '../src/lib/assistant/main/skills';
import {skillAcceptancePlanSchema,skillAcceptanceObservationSchema} from '../src/lib/assistant/main/skill-acceptance-policy';
import {appendSkillAcceptanceJudgment,readSkillAcceptanceEvidence} from '../src/lib/assistant/main/skill-acceptance-store';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID(),bundleId=randomUUID();
try{
 await pool.query(await readFile('db/migrations/130_skill_acceptance_evidence.sql','utf8'));
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Acceptance fixture','!','member','active')",[id,`${id}@example.invalid`]);
 const context={userId:owner,role:'member' as const},reviewContext={userId:owner,reviewerKind:'assistant-development' as const};
 const imported=await importSkill(context,{name:'Acceptance storage fixture',source:'synthetic-fixture',files:{'SKILL.md':'Read sources before answering.'},dependencies:[]});
 const version=(await pool.query('select * from agent_skill_version where skill_id=$1 and version=1',[imported.id])).rows[0];
 const pin={ownerId:owner,skillId:imported.id,version:1,contentHash:version.content_hash,sourceHash:digest({source:version.source,validation:version.validation,dependencies:version.dependencies})};
 const identity={runtimeHash:digest('synthetic-runtime'),promptHash:digest('synthetic-prompt'),toolSchemaHash:digest('synthetic-tools'),modelConfigHash:digest('synthetic-model'),scopeHash:digest('synthetic-scope')};
 const now=Date.now(),at=(delta:number)=>new Date(now+delta).toISOString();
 const plan=skillAcceptancePlanSchema.parse({protocol:'skill-acceptance-plan-v1',pin,identity,frozenAt:at(-10000),expiresAt:at(3600000),
  cases:['replay','negative','injection','permissions','shadow'].map(category=>({id:category,category,inputHash:digest(category),sourceHash:digest(`source:${category}`),provenance:category==='replay'?'historical-task':category==='shadow'?'prospective-task':'safety-fixture'}))});
 const arm={state:'completed',stopReason:null,answerHash:digest('synthetic-answer'),evidenceHash:digest('synthetic-evidence'),modelReceiptHashes:[digest('no-real-model-call')],requestedModel:'synthetic/model',actualModel:'synthetic/model',provider:'synthetic',identity,unexpectedEffects:0};
 const observations=plan.cases.map(item=>skillAcceptanceObservationSchema.parse({caseId:item.id,planHash:digest(plan),pin,inputHash:item.inputHash,sourceHash:item.sourceHash,provenance:item.provenance,
  capturedAt:at(-9000),taskStartedAt:at(-8000),completedAt:at(-7000),sourceCurrent:true,baseline:arm,candidate:arm}));
 const artifact={sourceKind:'synthetic-fixture',plan,observations,rawReceipts:{fixture:true,modelCalls:0}},artifactHash=digest(artifact);
 const insertSql=`insert into agent_skill_acceptance_bundle(id,owner_id,skill_id,version,source_kind,plan,observations,raw_receipts,artifact_hash)
  values($1,$2,$3,1,$4,$5,$6,$7,$8)`;
 const args=[bundleId,owner,imported.id,artifact.sourceKind,JSON.stringify(plan),JSON.stringify(observations),JSON.stringify(artifact.rawReceipts),artifactHash];
 await assert.rejects(()=>tenantTransaction(owner,client=>client.query(insertSql,args)),/permission denied/);
 await pool.query(insertSql,args); // Privileged synthetic fixture insertion only, never production collector evidence.
 const read=await readSkillAcceptanceEvidence(context,bundleId);assert.equal(read.artifactHash,artifactHash);assert.equal(read.sourcesCurrent,true);assert.equal(read.collectorProvenanceVerified,false);
 const corruptId=randomUUID();await pool.query(insertSql,[corruptId,...args.slice(1,7),digest('bad-artifact-hash')]);
 await assert.rejects(()=>readSkillAcceptanceEvidence(context,corruptId),/artifact changed/);
 await assert.rejects(()=>readSkillAcceptanceEvidence({userId:other},bundleId),/unavailable/);
 assert.equal((await tenantTransaction(other,client=>client.query('select id from agent_skill_acceptance_bundle where id=$1',[bundleId]))).rowCount,0);
 const verdict={answer:true,citation:true,permission:true,injection:true};
 const input={bundleId,artifactHash,expectedRevision:0,judgment:{caseId:'replay',observationHash:digest(observations[0]),revoked:false,baseline:verdict,candidate:verdict,rationale:'Synthetic store test; not an acceptance judgment.'}};
 await assert.rejects(()=>appendSkillAcceptanceJudgment({...reviewContext,userId:other},input),/unavailable/);
 await assert.rejects(()=>appendSkillAcceptanceJudgment(reviewContext,{...input,judgment:{...input.judgment,reviewerId:other,kind:'human'}}));
 await assert.rejects(()=>appendSkillAcceptanceJudgment(reviewContext,{...input,artifactHash:digest('stale')}),/Stale/);
 await assert.rejects(()=>appendSkillAcceptanceJudgment(reviewContext,{...input,judgment:{...input.judgment,observationHash:digest('stale')}}),/Stale/);
 const concurrent=await Promise.allSettled([appendSkillAcceptanceJudgment(reviewContext,input),appendSkillAcceptanceJudgment(reviewContext,input)]);
 assert.equal(concurrent.filter(row=>row.status==='fulfilled').length,1);assert.equal(concurrent.filter(row=>row.status==='rejected').length,1);
 const saved=await readSkillAcceptanceEvidence(context,bundleId);assert.equal(saved.judgments.length,1);assert.equal(saved.judgments[0].reviewerId,owner);assert.equal(saved.judgments[0].kind,'assistant-development');
 for(const table of ['agent_skill_acceptance_bundle','agent_skill_acceptance_judgment']){
  const key=table.endsWith('bundle')?'id':'bundle_id';
  await assert.rejects(()=>tenantTransaction(owner,client=>client.query(`delete from ${table} where ${key}=$1`,[bundleId])),/permission denied/);
  await assert.rejects(()=>pool.query(`delete from ${table} where ${key}=$1`,[bundleId]),/append-only/);
 }
 await assert.rejects(()=>pool.query('update agent_skill_acceptance_bundle set artifact_hash=$2 where id=$1',[bundleId,digest('changed')]),/append-only/);
 await assert.rejects(()=>pool.query("update agent_skill_acceptance_judgment set judgment=judgment||'{\"revoked\":true}' where bundle_id=$1",[bundleId]),/append-only/);
 // New Skill versions preserve old evidence, reject new passing reviews, but permit revocation.
 await importSkill(context,{skillId:imported.id,expectedVersion:1,name:'Updated fixture',source:'synthetic-fixture',files:{'SKILL.md':'Different instructions.'},dependencies:[]});
 const stale=await readSkillAcceptanceEvidence(context,bundleId);assert.equal(stale.sourcesCurrent,false);assert.equal(stale.judgments[0].revision,1);
 await assert.rejects(()=>appendSkillAcceptanceJudgment(reviewContext,{...input,expectedRevision:1}),/sources changed/);
 const revoked=await appendSkillAcceptanceJudgment(reviewContext,{...input,expectedRevision:1,judgment:{...input.judgment,revoked:true}});assert.equal(revoked.revision,2);
 const final=await readSkillAcceptanceEvidence(context,bundleId);assert.equal(final.judgments[0].revoked,true);assert.equal(final.judgments[0].revision,2);
 assert.equal((await pool.query('select count(*)::int n from agent_skill_acceptance_judgment where bundle_id=$1',[bundleId])).rows[0].n,2);
 await assert.rejects(()=>changeSkill(context,{id:imported.id,version:2,operation:'enable'}),/trusted production evidence gate unavailable/);
 const invalidJudgment={...final.judgments[0],caseId:'unknown-case',revision:1};
 await pool.query(`insert into agent_skill_acceptance_judgment(bundle_id,owner_id,case_id,revision,reviewer_id,reviewer_kind,observation_hash,judgment)
  values($1,$2,$3,1,$2,$4,$5,$6)`,[bundleId,owner,invalidJudgment.caseId,invalidJudgment.kind,invalidJudgment.observationHash,JSON.stringify(invalidJudgment)]);
 await assert.rejects(()=>readSkillAcceptanceEvidence(context,bundleId),/judgment binding changed/);
 const result={clone:true,migration:130,applicationEvidenceUploadDenied:true,crossAccountReadAndReviewDenied:true,forgedReviewerFieldsRejected:true,staleArtifactAndObservationRejected:true,
  concurrentReviewSingleWinner:true,appAndOwnerRewriteDenied:true,corruptArtifactRejected:true,unboundStoredJudgmentRejected:true,historyPreserved:true,changedSkillPassingReviewDenied:true,changedSkillRevocationAllowed:true,latestRevisionRead:true,automaticActivationDenied:true,
  evidenceSource:'synthetic-fixture',productionCollectorVerified:false,modelCalls:0,productionDeployed:false};
 await writeFile('tmp/skill-acceptance-store-clone-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 const client=await pool.connect();try{
  await client.query('begin');await client.query('set local session_replication_role=replica');
  for(const table of ['agent_skill_acceptance_judgment','agent_skill_acceptance_bundle'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[[owner,other]]);
  await client.query('delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=any($1::uuid[]))',[[owner,other]]);
  await client.query('delete from agent_skill where owner_id=any($1::uuid[])',[[owner,other]]);
  await client.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
