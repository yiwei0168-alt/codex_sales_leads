import assert from 'node:assert/strict';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction,withBoundTenantTransaction} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {lockCurrentSkillExperienceSources,type SourcedSkillVersion} from '../src/lib/assistant/main/skill-source-guard';
import {lockSkillAcceptanceRunJournals} from '../src/lib/assistant/main/skill-acceptance-run-locks';
import {lockSkillAcceptancePinnedMethods} from '../src/lib/assistant/main/skill-pinned-method-locks';
import {encryptMailboxContent} from '../src/lib/mailbox/crypto';
import {loadDecisionMemory} from '../src/lib/assistant/main/memory-context';
import {decisionMemoryMessage,assertRecordedDecisionMemory} from '../src/lib/assistant/main/decision-memory-message';
import {withCurrentDecisionMemory,MemoryContextChangedError} from '../src/lib/assistant/main/memory-message-guard';
import {revalidateLockedSkillExperienceTimes} from '../src/lib/assistant/main/skill-experience-time-check';
import {verifyKnowledgeReceiptByteDatabase} from './fixtures/skill-knowledge-byte-database';
import {verifyMemoryReceiptDatabase} from './fixtures/skill-memory-receipt-database';

nextEnv.loadEnvConfig(process.cwd());assert.equal(process.env.MA24_DISPOSABLE_MEMORY_SOURCE_LOCKS,'1','Disposable harness required');
process.env.PGOPTIONS='-c statement_timeout=10000';
process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(admin.host+admin.pathname,app.host+app.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),a=randomUUID(),b=randomUUID(),conflict=randomUUID();
const attachmentKey=`knowledge/ma24-memory-source-${randomUUID()}.txt`;let attachmentWritten=false;
const waitingOn=async(pid:number)=>Number((await pool.query(`with recursive waiting(pid) as (
 select $1::int union select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid)))
 select count(*) n from waiting where pid<>$1`,[pid])).rows[0].n);
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 const migration=await readFile('db/migrations/142_skill_memory_source_locks.sql','utf8');await pool.query(migration);await pool.query(migration);
 const originsMigration=await readFile('db/migrations/143_skill_memory_origin_locks.sql','utf8');await pool.query(originsMigration);await pool.query(originsMigration);
 const taskOriginsMigration=await readFile('db/migrations/144_skill_task_origin_locks.sql','utf8');await pool.query(taskOriginsMigration);await pool.query(taskOriginsMigration);
 const attachmentMigration=await readFile('db/migrations/145_skill_attachment_source_locks.sql','utf8');await pool.query(attachmentMigration);await pool.query(attachmentMigration);
 const timelineMigration=await readFile('db/migrations/147_skill_timeline_source_locks.sql','utf8');await pool.query(timelineMigration);await pool.query(timelineMigration);
 const decisionMigration=await readFile('db/migrations/148_skill_decision_memory_source_locks.sql','utf8');await pool.query(decisionMigration);await pool.query(decisionMigration);
 const knowledgeMigration=await readFile('db/migrations/149_skill_knowledge_source_locks.sql','utf8');await pool.query(knowledgeMigration);await pool.query(knowledgeMigration);
 const pinnedMethodMigration=await readFile('db/migrations/151_skill_pinned_method_source_locks.sql','utf8');await pool.query(pinnedMethodMigration);await pool.query(pinnedMethodMigration);
 for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic source locks','member','active')",[id,`${id}@example.invalid`]);
 const expiringMemory=randomUUID(),futureMemory=randomUUID();
 for(const [id,future] of [[expiringMemory,false],[futureMemory,true]] as const){
  await pool.query(`insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind,valid_from,valid_until)
   values($1,$2,'account','preference',$1::uuid::text,'explicit',
    case when $3 then clock_timestamp()+interval '2 seconds' else clock_timestamp()-interval '1 minute' end,
    case when $3 then null else clock_timestamp()+interval '2 seconds' end)`,[id,owner,future]);
  await pool.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic time-bound preference','{}')",[id]);
 }
 await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  const before=await loadDecisionMemory(owner);
  assert(before.some(row=>row.id===expiringMemory));assert(!before.some(row=>row.id===futureMemory));
  const messages=[{role:'system' as const,content:'Synthetic decision snapshot'},decisionMemoryMessage(before)];
  await client.query('select pg_sleep(2.1)');
  assert.equal((await client.query('select transaction_timestamp()<valid_until as old_clock_before_expiry from agent_memory where id=$1',[expiringMemory])).rows[0].old_clock_before_expiry,true);
  const after=await loadDecisionMemory(owner);
  assert(!after.some(row=>row.id===expiringMemory));assert(after.some(row=>row.id===futureMemory));
  assert.throws(()=>assertRecordedDecisionMemory(messages,after),/decision memory changed/);
 }));
 assert(!(await loadDecisionMemory(other)).some(row=>row.id===futureMemory));
 const preparationMemory=randomUUID();
 await pool.query(`insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind,valid_from,valid_until)
  values($1,$2,'account','preference',$1::uuid::text,'explicit',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '2 seconds')`,[preparationMemory,owner]);
 await pool.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic preparation-time preference','{}')",[preparationMemory]);
 await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  return withCurrentDecisionMemory(owner,async()=>{
   assert((await loadDecisionMemory(owner)).some(row=>row.id===preparationMemory));
   await client.query('select pg_sleep(2.1)');return {syntheticReadiness:true};
  });
 })),MemoryContextChangedError);
 const globalMemory=randomUUID();
 await pool.query("insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind) values($1,$2,'global','policy',$1::uuid::text,'explicit')",[globalMemory,owner]);
 await pool.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Synthetic shared policy','{}')",[globalMemory]);
 const decisionHolder=await pool.connect();let decisionWrites:Array<Promise<unknown>>=[];
 try{
  await decisionHolder.query('begin');await decisionHolder.query('set local role network_copilot_app');
  await decisionHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  await decisionHolder.query('select lock_skill_decision_memory_sources()');
  await tenantTransaction(other,async client=>{
   const id=randomUUID();
   await client.query("insert into agent_memory(id,owner_id,scope,kind,memory_key,source_kind) values($1,$2,'account','preference',$1::uuid::text,'explicit')",[id,other]);
   await client.query("insert into agent_memory_version(memory_id,version,content,scope_snapshot) values($1,1,'Other account synthetic preference','{}')",[id]);
  });
  const pid=(await decisionHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  decisionWrites=[tenantTransaction(owner,client=>client.query('update agent_memory set active=active where id=$1',[futureMemory])),
   tenantTransaction(owner,client=>client.query("insert into agent_memory_observation(owner_id,kind,content,source_receipt) values($1,'experience','Synthetic memory phantom','{}')",[owner])),
   pool.query('update agent_memory_version set content=content where memory_id=$1',[globalMemory])];
  for(const work of decisionWrites)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===3)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,3,'Owned update, observation insert and shared-policy rewrite must wait');
 }finally{await decisionHolder.query('rollback');decisionHolder.release();}
 await Promise.all(decisionWrites);
 const bytes=Buffer.from('Synthetic attachment');
 const documentId=randomUUID(),assetId=randomUUID(),treeId=randomUUID(),sha=createHash('sha256').update(bytes).digest('hex');
 await mkdir('knowledge',{recursive:true});await writeFile(attachmentKey,bytes,{flag:'wx'});attachmentWritten=true;
 const collection=(await pool.query('select id from knowledge_collection order by id limit 1')).rows[0].id;
 await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,$2,$1::uuid::text,'Synthetic attachment','synthetic',$3,$4,'private')`,[documentId,collection,sha,owner]);
 await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
  values($1,$2,$4,$3,'text/plain',$5,'text','synthetic')`,[assetId,documentId,sha,attachmentKey,bytes.length]);
 await pool.query(`insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status)
  values($1,$2,$3,$4,'synthetic',$4,'ready')`,[treeId,documentId,assetId,sha]);
 await pool.query('update knowledge_document set current_tree_version_id=$1 where id=$2',[treeId,documentId]);
 const attachmentLock=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_attachment_sources($1::uuid[]) n',[ids])).rows[0].n);
 assert.equal(await attachmentLock([]),0);assert.equal(await attachmentLock([assetId]),1);
 await assert.rejects(attachmentLock([assetId],other),/unavailable/);await assert.rejects(attachmentLock([assetId,assetId]),/Invalid/);
 const attachmentHolder=await pool.connect();let attachmentPending:Array<Promise<unknown>>=[];
 try{
  await attachmentHolder.query('begin');await attachmentHolder.query('set local role network_copilot_app');
  await attachmentHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await attachmentHolder.query('select lock_skill_attachment_sources($1::uuid[]) n',[[assetId]])).rows[0].n,1);
  const pid=(await attachmentHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  attachmentPending=[pool.query('update knowledge_document set visibility=visibility where id=$1',[documentId]),
   pool.query('update knowledge_asset set registration_status=registration_status where id=$1',[assetId]),
   pool.query('update knowledge_tree_version set status=status where id=$1',[treeId])];
  for(const work of attachmentPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===3)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,3,'Document ACL, asset registration and current tree updates must wait');
 }finally{await attachmentHolder.query('rollback');attachmentHolder.release();}
 await Promise.all(attachmentPending);
 const sharedDocument=randomUUID(),sharedAsset=randomUUID(),releaseId=randomUUID(),pointerId=randomUUID();
 await pool.query(`insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
  values($1,$2,$1::uuid::text,'Synthetic shared source','synthetic',$3,$4,'shared')`,[sharedDocument,collection,sha,other]);
 await pool.query(`insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
  values($1,$2,'synthetic/shared.txt',$3,'text/plain',0,'text','synthetic')`,[sharedAsset,sharedDocument,sha]);
 await pool.query(`insert into knowledge_release_v3(id,release_key,scope_kind,owner_id,extractor_profile,chunk_profile)
  values($1,$1::uuid::text,'owner',$2,'synthetic','synthetic')`,[releaseId,owner]);
 await pool.query("insert into knowledge_release_pointer_v3(id,scope_kind,owner_id,release_id) values($1,'owner',$2,$3)",[pointerId,owner,releaseId]);
 const publicationHolder=await pool.connect();const publicationWrites:Array<Promise<unknown>>=[];
 try{
  await publicationHolder.query('begin');await publicationHolder.query('set local role network_copilot_app');
  await publicationHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  await publicationHolder.query('select lock_skill_knowledge_sources()');
  let signalPrelocked:()=>void=()=>{};const prelocked=new Promise<void>(accept=>{signalPrelocked=accept;});
  const publisher=tenantTransaction(other,async client=>{
   assert.equal((await client.query('select id from knowledge_asset where id=$1 for update',[sharedAsset])).rows.length,1);
   signalPrelocked();await client.query('update knowledge_asset set registration_status=registration_status where id=$1',[sharedAsset]);
  });
  publicationWrites.push(publisher);void publisher.catch(()=>signalPrelocked());await prelocked;
  const pid=(await publicationHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  let waiting=0;
  for(let i=0;i<100;i++){waiting=await waitingOn(pid);if(waiting===1)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(waiting,1,'Prelocked asset publisher must wait at source admission');
  await publicationHolder.query("set local statement_timeout='2s'");
  assert.equal((await publicationHolder.query('select lock_skill_attachment_sources($1::uuid[]) n',[[sharedAsset]])).rows[0].n,1);
  publicationWrites.push(tenantTransaction(owner,client=>client.query('update knowledge_document set status=status where id=$1',[documentId])),
   pool.query('update knowledge_release_pointer_v3 set activated_at=activated_at where id=$1',[pointerId]),
   pool.query("insert into knowledge_review_queue_v3(release_id,asset_id,reason) values($1,$2,'low-confidence')",[releaseId,assetId]));
  for(const work of publicationWrites)void work.catch(()=>undefined);
  for(let i=0;i<100;i++){waiting=await waitingOn(pid);if(waiting===4)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(waiting,4,'Private document, shared asset, release pointer and review inserts must wait');
 }finally{await publicationHolder.query('rollback');publicationHolder.release();}
 await Promise.all(publicationWrites);
 const conversation=randomUUID(),quote='I found comparing original tables reduced errors.',memoryKey='source-lock-fixture';
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic source provenance')",[conversation,owner]);
 const refs=[];
 for(const id of [a,b]){
  const runId=randomUUID(),messageId=randomUUID();
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$4,'{}','{}','completed','main-agent')`,[runId,owner,conversation,digest(quote)]);
  await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",
   [messageId,owner,conversation,quote,JSON.stringify({runId})]);
  const receipt={type:'local-qwen3-extraction',usage:'unverified-user-experience',sourceQuote:quote,runId,messageId};
  await pool.query("insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,memory_key) values($1,$2,'experience',$3,$4,$5)",[id,owner,quote,JSON.stringify(receipt),memoryKey]);
  refs.push({observationId:id,runId,messageId,receiptSha256:digest(receipt)});
 }
 const fingerprint=digest({version:'experience-draft-v1',memoryKey,quote}),files={'SKILL.md':'Synthetic source-lock method'};
 const version:SourcedSkillVersion={owner_id:owner,scope:'account',files,content_hash:digest(files),source:`local-experience:${fingerprint}`,
  validation:{sourceQuality:'repeated-user-report-unverified',methodFingerprint:fingerprint,sourceObservations:refs}};
 await pool.query("insert into agent_memory_conflict(id,owner_id,earlier_id,later_id,status) values($1,$2,$3,$4,'resolved')",[conflict,owner,a,b]);
 const lock=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_memory_sources($1::uuid[]) as n',[ids])).rows[0].n);
 assert.equal(await lock([]),0);assert.equal(await lock([a,b]),2);
 const guarded=await tenantTransaction(owner,client=>lockCurrentSkillExperienceSources(client,owner,version));
 assert.deepEqual(guarded,{localExperienceSourceLocksHeld:true,observationCount:2});
 const methodId=randomUUID(),globalMethodId=randomUUID(),lateMethodId=randomUUID();
 for(const [id,methodOwner,scope,methodVersion] of [[methodId,owner,'account',version],
  [globalMethodId,other,'global',{...version,source:'synthetic-import',validation:{}}],
  [lateMethodId,owner,'account',{...version,source:'synthetic-import',validation:{}}]] as const){
  await pool.query("insert into agent_skill(id,owner_id,name,scope,enabled,published) values($1,$2,'Synthetic pinned method',$3,true,$4)",[id,methodOwner,scope,scope==='global']);
  await pool.query('insert into agent_skill_version(skill_id,version,content_hash,source,files,validation) values($1,1,$2,$3,$4,$5)',
   [id,methodVersion.content_hash,methodVersion.source,JSON.stringify(methodVersion.files),JSON.stringify(methodVersion.validation)]);
 }
 for(const [runId,skillId] of [[refs[0].runId,methodId],[refs[1].runId,methodId],[refs[0].runId,globalMethodId]])
  await pool.query('insert into agent_run_skill(user_id,run_id,skill_id,version) values($1,$2,$3,1)',[owner,runId,skillId]);
 const methodArtifact={plan:{cases:refs.map((_,i)=>({id:String(i),provenance:'safety-fixture'}))},
  rawReceipts:{safetySources:Object.fromEntries(refs.map((ref,i)=>[String(i),{runId:ref.runId}]))}};
 const methodLock=()=>tenantTransaction(owner,client=>lockSkillAcceptancePinnedMethods(client,owner,methodArtifact));
 assert.deepEqual(await methodLock(),{pinnedMethodSourcesLocked:true,pinnedMethodPinCount:3,pinnedMethodVersionCount:2,pinnedMethodExperienceObservationCount:2});
 const methodRequest=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_pinned_method_sources($1::uuid[]) n',[ids])).rows[0].n);
 assert.equal(await methodRequest([]),0);
 await assert.rejects(methodRequest([refs[0].runId],other),/task unavailable/);
 await assert.rejects(methodRequest([refs[0].runId,refs[0].runId]),/Invalid/);
 await assert.rejects(methodRequest(null),/Invalid/);
 const methodGrants=(await pool.query(`select
  has_table_privilege('network_copilot_app','agent_skill_version','UPDATE') as version_update,
  has_table_privilege('network_copilot_app','agent_run_skill','UPDATE') as pin_update,
  has_function_privilege('network_copilot_skill_collector','lock_skill_pinned_method_sources(uuid[])','EXECUTE') as collector_execute`)).rows[0];
 assert.deepEqual(methodGrants,{version_update:false,pin_update:false,collector_execute:false});
 const methodHolder=await pool.connect();let methodWrites:Array<Promise<unknown>>=[];
 try{
  await methodHolder.query('begin');await methodHolder.query('set local role network_copilot_app');
  await methodHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  await methodHolder.query('select lock_skill_decision_memory_sources()');
  assert.equal((await lockSkillAcceptancePinnedMethods(methodHolder,owner,methodArtifact)).pinnedMethodPinCount,3);
  const pid=(await methodHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  methodWrites=[
   pool.query('update agent_skill set enabled=false where id=$1',[methodId]),
   pool.query('update agent_skill set published=false where id=$1',[globalMethodId]),
   pool.query('update agent_skill_version set source=source where skill_id=$1',[methodId]),
   pool.query('update agent_run_skill set version=version where user_id=$1 and run_id=$2 and skill_id=$3',[owner,refs[0].runId,methodId]),
   pool.query('insert into agent_run_skill(user_id,run_id,skill_id,version) values($1,$2,$3,1)',[owner,refs[0].runId,lateMethodId]),
   pool.query('update assistant_message set content=content where id=$1',[refs[0].messageId]),
  ];
  for(const work of methodWrites)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){waiting=await waitingOn(pid);if(waiting===6)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(waiting,6,'Method disable, global withdrawal, version/pin rewrite, new pin and original-message edit must wait');
 }finally{await methodHolder.query('rollback');methodHolder.release();}
 await Promise.all(methodWrites);
 await assert.rejects(methodLock(),/method source changed/);
 await pool.query('update agent_skill set enabled=true where id=$1',[methodId]);
 await assert.rejects(methodLock(),/method source changed/);
 await pool.query('update agent_skill set published=true where id=$1',[globalMethodId]);
 await pool.query('update agent_skill_version set files=$2 where skill_id=$1',[methodId,JSON.stringify({'SKILL.md':'Changed synthetic method'})]);
 await assert.rejects(methodLock(),/method source changed/);
 await pool.query('update agent_skill_version set files=$2 where skill_id=$1',[methodId,JSON.stringify(files)]);
 await pool.query('update assistant_message set content=$2 where id=$1',[refs[0].messageId,'Changed synthetic method original']);
 await assert.rejects(methodLock(),/sources changed after locking/);
 await pool.query('update assistant_message set content=$2 where id=$1',[refs[0].messageId,quote]);
 assert.deepEqual(await methodLock(),{pinnedMethodSourcesLocked:true,pinnedMethodPinCount:4,pinnedMethodVersionCount:3,pinnedMethodExperienceObservationCount:2});
 const timeArtifact={...methodArtifact,plan:{...methodArtifact.plan,pin:{ownerId:owner,skillId:methodId,version:1},expiresAt:new Date(Date.now()+3600000).toISOString()}};
 const timeCheck=()=>tenantTransaction(owner,client=>revalidateLockedSkillExperienceTimes(client,owner,timeArtifact));
 assert.equal((await timeCheck()).methodExperienceTimeObservationCount,2);
 for(const field of ['runnerDeclarationValidBefore','transportValidBefore'] as const){
  await tenantTransaction(owner,async client=>{
   const expires=(await client.query<{until:Date}>("select clock_timestamp()+interval '2 seconds' until")).rows[0].until.toISOString();
   const first=await revalidateLockedSkillExperienceTimes(client,owner,timeArtifact,{[field]:expires});
   assert.equal(first.acceptanceValidBefore,expires);assert.equal(first.acceptanceTimeCheckedAt,first.methodExperienceTimeCheckedAt);
   await client.query('select pg_sleep(2.1)');
   assert.equal((await client.query('select transaction_timestamp()<$1::timestamptz old_clock',[expires])).rows[0].old_clock,true);
   await assert.rejects(revalidateLockedSkillExperienceTimes(client,owner,timeArtifact,{[field]:expires}),/signed evidence expired after preparation/);
   assert.equal((await revalidateLockedSkillExperienceTimes(client,owner,timeArtifact)).methodExperienceTimeObservationCount,2);
  });
 }
 await assert.rejects(tenantTransaction(owner,client=>revalidateLockedSkillExperienceTimes(client,owner,
  {...timeArtifact,plan:{...timeArtifact.plan,expiresAt:new Date(Date.now()-1000).toISOString()}})),/time changed after preparation/);
 const timedIds=[randomUUID(),randomUUID()],timedMethod=randomUUID();
 for(let i=0;i<2;i++)await pool.query(`insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,memory_key,valid_from,valid_until)
  select $1,owner_id,kind,content,source_receipt,memory_key,valid_from,clock_timestamp()+interval '3 seconds'
  from agent_memory_observation where id=$2`,[timedIds[i],[a,b][i]]);
 const timedVersion={...version,validation:{...(version.validation as Record<string,unknown>),sourceObservations:refs.map((ref,i)=>({...ref,observationId:timedIds[i]}))}};
 await pool.query("insert into agent_skill(id,owner_id,name,scope,enabled) values($1,$2,'Synthetic expiring experience method','account',true)",[timedMethod,owner]);
 await pool.query('insert into agent_skill_version(skill_id,version,content_hash,source,files,validation) values($1,1,$2,$3,$4,$5)',
  [timedMethod,timedVersion.content_hash,timedVersion.source,JSON.stringify(timedVersion.files),JSON.stringify(timedVersion.validation)]);
 await pool.query('insert into agent_run_skill(user_id,run_id,skill_id,version) values($1,$2,$3,1)',[owner,refs[0].runId,timedMethod]);
 const timedArtifact=timeArtifact; // The candidate stays valid; only another pinned method expires.
 await assert.rejects(tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  await lockSkillAcceptancePinnedMethods(client,owner,timedArtifact);
  assert.equal((await revalidateLockedSkillExperienceTimes(client,owner,timedArtifact)).methodExperienceTimeObservationCount,4);
  await client.query('select pg_sleep(3.1)');
  assert.equal((await client.query('select transaction_timestamp()<min(valid_until) as old_clock_before_expiry from agent_memory_observation where id=any($1::uuid[])',[timedIds])).rows[0].old_clock_before_expiry,true);
  return revalidateLockedSkillExperienceTimes(client,owner,timedArtifact);
 })),/time changed after preparation/);
 const expiring=[randomUUID(),randomUUID()];
 for(let i=0;i<2;i++)await pool.query(`insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,memory_key,valid_until)
  select $1,owner_id,kind,content,source_receipt,memory_key,clock_timestamp()+interval '1 second' from agent_memory_observation where id=$2`,[expiring[i],[a,b][i]]);
 const expiringVersion={...version,validation:{...(version.validation as Record<string,unknown>),sourceObservations:refs.map((ref,i)=>({...ref,observationId:expiring[i]}))}};
 await tenantTransaction(owner,async client=>{
  assert.equal((await client.query('select transaction_timestamp()<min(valid_until) as before_expiry from agent_memory_observation where id=any($1::uuid[])',[expiring])).rows[0].before_expiry,true);
  await client.query('select pg_sleep(1.1)');
  await assert.rejects(lockCurrentSkillExperienceSources(client,owner,expiringVersion),/changed after locking/);
 });
 await assert.rejects(lock([a],other),/unavailable/);await assert.rejects(lock([a,a]),/Invalid/);await assert.rejects(lock(null),/Invalid/);
 const grants=(await pool.query(`select has_table_privilege('network_copilot_app','agent_memory_observation','UPDATE') as observation_update,
  has_function_privilege('network_copilot_skill_collector','lock_skill_memory_sources(uuid[])','EXECUTE') as collector_execute`)).rows[0];
 assert.deepEqual(grants,{observation_update:false,collector_execute:false});
 const originHolder=await pool.connect();let originPending:Array<Promise<unknown>>=[];
 try{
  await originHolder.query('begin');await originHolder.query('set local role network_copilot_app');
  await originHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await originHolder.query('select lock_skill_memory_sources($1::uuid[]) as n',[[a,b]])).rows[0].n,2);
  const pid=(await originHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  originPending=[
   pool.query('update app_user set status=status where id=$1',[owner]),
   pool.query('update assistant_conversation set title=title where id=$1',[conversation]),
   pool.query('update agent_run set status=status where id=$1',[refs[0].runId]),
   pool.query('update assistant_message set content=content where id=$1',[refs[0].messageId]),
  ];
  for(const work of originPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===4)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,4,'Account, conversation, run and message updates must all wait');
 }finally{await originHolder.query('rollback');originHolder.release();}
 await Promise.all(originPending);
 await pool.query('update assistant_message set content=$1 where id=$2',['Changed synthetic source',refs[0].messageId]);
 await assert.rejects(tenantTransaction(owner,client=>lockCurrentSkillExperienceSources(client,owner,version)),/changed after locking/);
 await pool.query('update assistant_message set content=$1 where id=$2',[quote,refs[0].messageId]);
 const taskOriginLock=(ids:unknown,user=owner)=>tenantTransaction(user,async client=>(await client.query('select lock_skill_task_origins($1::uuid[]) n',[ids])).rows[0].n);
 assert.equal(await taskOriginLock([]),0);assert.equal(await taskOriginLock(refs.map(ref=>ref.runId)),2);
 await assert.rejects(taskOriginLock([refs[0].runId],other),/unavailable/);
 await assert.rejects(taskOriginLock([refs[0].runId,refs[0].runId]),/Invalid/);
 await assert.rejects(taskOriginLock(null),/Invalid/);
 const taskOriginHolder=await pool.connect();let taskOriginPending:Array<Promise<unknown>>=[];
 try{
  await taskOriginHolder.query('begin');await taskOriginHolder.query('set local role network_copilot_app');
  await taskOriginHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await taskOriginHolder.query('select lock_skill_task_origins($1::uuid[]) n',[refs.map(ref=>ref.runId)])).rows[0].n,2);
  const pid=(await taskOriginHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  taskOriginPending=[
   pool.query('update app_user set status=status where id=$1',[owner]),
   pool.query('update assistant_conversation set title=title where id=$1',[conversation]),
   pool.query('update assistant_message set content=content where id=$1',[refs[0].messageId]),
   pool.query(`insert into assistant_message(user_id,conversation_id,role,intent,content) values($1,$2,'user','general','Synthetic concurrent history')`,[owner,conversation]),
  ];
  for(const work of taskOriginPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===4)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,4,'Account, conversation, message update and history append must wait');
 }finally{await taskOriginHolder.query('rollback');taskOriginHolder.release();}
 await Promise.all(taskOriginPending);
 const journalId=randomUUID(),runId=refs[0].runId;
 const connectionId=randomUUID(),mailId=randomUUID();
 await pool.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic lock fixture','unusable-synthetic')",[connectionId,owner,`${connectionId}@example.invalid`]);
 await pool.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext)
  values($1,$2,$3,'Synthetic','1',1,'inbound',$4,$5)`,[mailId,owner,connectionId,digest('Synthetic mail'),
  encryptMailboxContent(owner,{subject:'Synthetic mail',bodyText:'Synthetic body',sender:[],recipients:[]})]);
 await pool.query('update agent_run set input=$1 where id=$2',[JSON.stringify({content:'Synthetic complete task',mode:'standard',requestKey:'synthetic-source-lock',attachments:[{assetId}]}),runId]);
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
  values($1,$2,$3,'existing','synthetic','v1',$4,'{}','read','completed')`,[journalId,owner,runId,digest({})]);
 await pool.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
  values($1,$2,'mail-source','mail_read','v1',$3,$4,'read','completed')`,[owner,runId,digest({messageId:mailId}),JSON.stringify({messageId:mailId})]);
 const runArtifact={plan:{cases:[{id:'case',provenance:'historical-task'}]},rawReceipts:{baselineSources:{case:{runId}},candidateSources:{case:{runId}}}};
 const journalHolder=await pool.connect();let journalPending:Array<Promise<unknown>>=[];
 try{
  await journalHolder.query('begin');await journalHolder.query('set local role network_copilot_app');
  await journalHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.deepEqual(await lockSkillAcceptanceRunJournals(journalHolder,owner,runArtifact),{prospectiveCaptureSourcesLocked:true,prospectiveJobCount:0,timelineSourcesLocked:true,timelineCustomerCount:0,mailReadSourcesLocked:true,mailCount:1,attachmentMetadataLocked:true,attachmentCount:1,taskOriginsLocked:true,taskJournalsLocked:true,runCount:1});
  const pid=(await journalHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  journalPending=[
   pool.query('update agent_run set status=status where id=$1',[runId]),
   pool.query('update agent_tool_call set output=output where id=$1',[journalId]),
   pool.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
    values($1,$2,'appended','synthetic','v1',$3,'{}','read','completed')`,[owner,runId,digest({})]),
   pool.query('update knowledge_document set visibility=visibility where id=$1',[documentId]),
   pool.query('update knowledge_asset set registration_status=registration_status where id=$1',[assetId]),
   pool.query('update knowledge_tree_version set status=status where id=$1',[treeId]),
   pool.query('update mailbox_message set metadata=metadata where id=$1',[mailId]),
  ];
  for(const work of journalPending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===7)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,7,'Task/journal, stored attachment and mail metadata updates must all wait');
 }finally{await journalHolder.query('rollback');journalHolder.release();}
 await Promise.all(journalPending);
 const customerId=randomUUID(),secondMail=randomUUID(),unlinkedMail=randomUUID();
 await pool.query("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$1::uuid::text,'Synthetic customer')",[customerId,owner]);
 for(const [i,id] of [secondMail,unlinkedMail].entries())await pool.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext)
  values($1,$2,$3,'Synthetic','1',$4,'inbound',$5,$6)`,[id,owner,connectionId,i+2,digest('Synthetic mail'),
  encryptMailboxContent(owner,{subject:'Synthetic mail',bodyText:'Synthetic body',sender:[],recipients:[]})]);
 for(const id of [mailId,secondMail])await pool.query('insert into mailbox_customer_message(user_id,customer_id,message_id) values($1,$2,$3)',[owner,customerId,id]);
 await pool.query("insert into mailbox_timeline_note(user_id,message_id,content_hash,ciphertext,model) values($1,$2,$3,'synthetic-note','synthetic')",[owner,secondMail,digest('Synthetic mail')]);
 await pool.query(`insert into agent_tool_call(user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status)
  values($1,$2,'timeline-source','customer_timeline','v1',$3,'{}','read','completed')`,[owner,runId,digest({})]);
 await assert.rejects(tenantTransaction(other,client=>client.query('select lock_skill_timeline_sources($1::uuid[],false)',[[customerId]])),/customer unavailable/);
 const timelineHolder=await pool.connect();let timelinePending:Array<Promise<unknown>>=[];
 try{
  await timelineHolder.query('begin');await timelineHolder.query('set local role network_copilot_app');
  await timelineHolder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  const held=await lockSkillAcceptanceRunJournals(timelineHolder,owner,runArtifact);
  assert.equal(held.timelineSourcesLocked,true);assert.equal(held.timelineCustomerCount,1);
  const pid=(await timelineHolder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  timelinePending=[pool.query('update mailbox_customer set archived=archived where id=$1',[customerId]),
   pool.query('update mailbox_customer_message set source=source where user_id=$1 and customer_id=$2 and message_id=$3',[owner,customerId,mailId]),
   pool.query('update mailbox_message set metadata=metadata where id=$1',[mailId]),
   pool.query('update mailbox_timeline_note set ciphertext=ciphertext where user_id=$1 and message_id=$2',[owner,secondMail]),
   pool.query('insert into mailbox_customer_message(user_id,customer_id,message_id) values($1,$2,$3)',[owner,customerId,unlinkedMail]),
   pool.query("insert into mailbox_timeline_note(user_id,message_id,content_hash,ciphertext,model) values($1,$2,$3,'synthetic-note','synthetic')",[owner,mailId,digest('Synthetic mail')]),
   pool.query("insert into mailbox_customer(user_id,identity_key,name) values($1,$2,'Synthetic new customer')",[owner,randomUUID()])];
  for(const work of timelinePending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===7)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,7,'Timeline updates and new links, notes and customers must all wait');
 }finally{await timelineHolder.query('rollback');timelineHolder.release();}
 await Promise.all(timelinePending);
 await assert.rejects(tenantTransaction(other,client=>lockSkillAcceptanceRunJournals(client,other,runArtifact)),/origin unavailable/);
 const holder=await pool.connect();let pending:Array<Promise<unknown>>=[];const finished=[false,false,false];
 try{
  await holder.query('begin');await holder.query('set local role network_copilot_app');
  await holder.query("select set_config('app.current_user_id',$1,true)",[owner]);
  assert.equal((await holder.query('select lock_skill_memory_sources($1::uuid[]) as n',[[a,b]])).rows[0].n,2);
  const pid=(await holder.query('select pg_backend_pid() as pid')).rows[0].pid as number;
  pending=[
   tenantTransaction(owner,client=>client.query("insert into agent_memory_observation(owner_id,kind,content,source_receipt,corrects_id) values($1,'experience','Synthetic correction','{}',$2)",[owner,a])),
   tenantTransaction(owner,client=>client.query("insert into agent_memory_observation(owner_id,kind,content,source_receipt,invalidates_id) values($1,'experience','Synthetic invalidation','{}',$2)",[owner,b])),
   tenantTransaction(owner,client=>client.query("update agent_memory_conflict set status='open' where owner_id=$1 and id=$2",[owner,conflict])),
  ].map((work,index)=>work.finally(()=>{finished[index]=true;}));
  for(const work of pending)void work.catch(()=>undefined);
  let waiting=0;
  for(let i=0;i<100;i++){
   waiting=await waitingOn(pid);
   if(waiting===3)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,3,'Correction, invalidation and conflict update must all wait');assert.deepEqual(finished,[false,false,false]);
 }finally{await holder.query('rollback');holder.release();}
 await Promise.all(pending);assert.deepEqual(finished,[true,true,true]);
 const state=(await pool.query(`select exists(select 1 from agent_memory_observation where corrects_id=$1) as corrected,
  exists(select 1 from agent_memory_observation where invalidates_id=$2) as invalidated,
  (select status from agent_memory_conflict where id=$3) as conflict`,[a,b,conflict])).rows[0];
 assert.deepEqual(state,{corrected:true,invalidated:true,conflict:'open'});
 await assert.rejects(tenantTransaction(owner,client=>lockCurrentSkillExperienceSources(client,owner,version)),/changed after locking/);
 assert.equal((await pool.query("select to_regclass('public.ma24_evaluation_hard_limit') is null absent")).rows[0].absent,true);
 await verifyKnowledgeReceiptByteDatabase(pool,{owner,other,documentId,assetId,treeId,sha,key:attachmentKey,bytes});
 await verifyMemoryReceiptDatabase(pool,owner,other);
 console.log(JSON.stringify({memorySourceLocksDatabase:'passed',signedTransportAndDeclarationFinalExpiryRejected:true,signedDeadlinesUseSameMethodDatabaseClock:true,methodExperienceExpiryAfterPreparationRejected:true,methodExperienceCommonDatabaseClockVerified:true,decisionMemoryFinalPreparationBoundaryRejected:true,pinnedMethodSixWritersBlocked:true,pinnedMethodRevocationAndOriginalChangeRejected:true,pinnedMethodPrivilegesUnchanged:true,correctionInvalidationAndConflictBlocked:true,allWritersResumeAfterRelease:true,
  foreignOwnerAndInvalidIdsRejected:true,knowledgePublicationAndReviewWritesBlocked:true,attachmentReadUnderPrelockedPublisherCompletes:true,decisionMemoryWriteAndPhantomGateVerified:true,otherAccountPrivateMemoryWriteContinues:true,decisionMemoryWallClockRevalidated:true,timelineUpdatesAndPhantomInsertsBlocked:true,mailMetadataUpdatesBlocked:true,attachmentMetadataUpdatesBlocked:true,privateAttachmentForeignOwnerRejected:true,taskOriginsAndHistoryAppendBlocked:true,taskAndJournalUpdateAndAppendBlocked:true,foreignTaskJournalLockRejected:true,noObservationUpdateGrant:true,originUpdatesBlocked:true,changedOriginalMessageRejected:true,storedProvenanceLockThenRecheck:true,invalidatedProvenanceRejectedAfterLock:true,expiryAfterTransactionStartRejected:true,
  deferredEvaluationMigrationsApplied:false,actualModelCalls:0,automaticActivation:false}));
}finally{try{if(attachmentWritten)await unlink(attachmentKey);}finally{await pool.end();await getPool().end();}}
