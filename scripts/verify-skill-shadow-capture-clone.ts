import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction,tenantQuery} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {importSkill} from '../src/lib/assistant/main/skills';
import {prepareShadowRegistration,prepareSkillShadow,processNextSkillShadow} from '../src/lib/assistant/main/skill-shadow';
import {knowledgeCompareTool} from '../src/lib/assistant/main/knowledge-compare-tool';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),conversation=randomUUID();
globalThis.fetch=async()=>{throw new Error('Network disabled in capture probe');};
try{
 await pool.query(await readFile('db/migrations/123_skill_shadow_capture.sql','utf8'));
 await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Shadow capture fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Shadow fixture')",[conversation,owner]);
 const skill=await importSkill({userId:owner,role:'member'},{name:'Synthetic prospective method',source:'synthetic-probe',files:{'SKILL.md':'Read and cite original sources.'},dependencies:[]});
 assert(skill.id);const contentHash=digest({'SKILL.md':'Read and cite original sources.'});
 const createRun=async()=>{
  const id=randomUUID();
  await tenantTransaction(owner,c=>c.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
   values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}','queued','main-agent')`,[id,owner,conversation,JSON.stringify({content:'Synthetic prospective analysis only.'})]));
  return id;
 };
 const oldRun=await createRun(),campaign=randomUUID();
 await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
  values($1,$2,$3,1,$4,$5,$6,true,now()+interval '1 hour')`,[campaign,owner,skill.id,contentHash,digest({source:'synthetic-probe'}),JSON.stringify({engine:'local-read-only',automaticActivation:false})]);
 const activeRun=await createRun(),cancelledRun=await createRun();
 let jobs=await tenantQuery<{id:string;run_id:string;state:string;start_context:Record<string,unknown>}>(owner,'select * from agent_skill_shadow_job where owner_id=$1 order by created_at',[owner]);
 assert.equal(jobs.length,2);assert(!jobs.some(j=>j.run_id===oldRun));
 const active=jobs.find(j=>j.run_id===activeRun)!;assert.equal(active.state,'observing');
 assert.equal(active.start_context.kind,'prospective-server-capture');
 assert.equal(active.start_context.contentHash,contentHash);
 const complete=async(runId:string,status:string)=>tenantTransaction(owner,c=>c.query('update agent_run set status=$3,result=$4 where user_id=$1 and id=$2',[owner,runId,status,JSON.stringify({reply:'Synthetic result'})]));
 await complete(oldRun,'completed');
 assert.equal((await pool.query('select count(*)::int as n from agent_skill_shadow_job where run_id=$1',[oldRun])).rows[0].n,0);
 await complete(activeRun,'paused');
 assert.equal((await pool.query('select state from agent_skill_shadow_job where id=$1',[active.id])).rows[0].state,'observing');
 await complete(activeRun,'running');
 const call=randomUUID(),args={messageId:randomUUID()};
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
  values($1,$2,$3,$1::uuid::text,'mail_read','1',$4,$5,'read','completed',$6)`,[call,owner,activeRun,digest(args),JSON.stringify(args),JSON.stringify({status:'success',data:{synthetic:true}})]);
 await complete(activeRun,'completed');await complete(activeRun,'completed');await complete(cancelledRun,'cancelled');
 const captured=(await pool.query('select * from agent_skill_shadow_job where id=$1',[active.id])).rows[0];
 assert.equal(captured.state,'queued');assert(captured.ready_at);assert.equal(captured.final_context.receipts.length,1);
 assert.equal(captured.final_context.receipts[0].id,call);assert.match(captured.final_context.resultHash,/^[a-f0-9]{64}$/);
 assert.equal((await pool.query("select count(*)::int as n from agent_skill_shadow_event where job_id=$1 and kind='source-task-completed'",[active.id])).rows[0].n,1);
 assert.equal((await pool.query('select state from agent_skill_shadow_job where run_id=$1',[cancelledRun])).rows[0].state,'skipped');
 for(const table of ['agent_skill_shadow_campaign','agent_skill_shadow_job','agent_skill_shadow_event']){
  assert.equal((await tenantQuery(randomUUID(),`select * from ${table} where owner_id=$1`,[owner])).length,0);
  await assert.rejects(()=>tenantTransaction(owner,c=>c.query(`update ${table} set owner_id=owner_id where owner_id=$1`,[owner])));
  await assert.rejects(()=>tenantTransaction(owner,c=>c.query(`delete from ${table} where owner_id=$1`,[owner])));
 }
 await assert.rejects(()=>tenantTransaction(owner,c=>c.query(`insert into agent_skill_shadow_job(owner_id,run_id,campaign_id,start_context)
  values($1,$2,$3,'{}')`,[owner,oldRun,campaign])));
 assert.equal((await tenantQuery(randomUUID(),'select * from claim_skill_shadow_job()')).length,0);
 const claimed=await Promise.all([tenantQuery<{lease_token:string}>(owner,'select * from claim_skill_shadow_job()'),tenantQuery<{lease_token:string}>(owner,'select * from claim_skill_shadow_job()')]);
 assert.equal(claimed.filter(r=>r.length).length,1);const firstToken=claimed.find(r=>r.length)![0].lease_token;
 const record=async(n:number,phase:string,token=firstToken)=>(await tenantQuery<{ok:boolean}>(owner,'select record_skill_shadow_model_call($1,$2,$3,$4,$5) as ok',[active.id,token,n,phase,JSON.stringify({hash:'a'.repeat(64)})]))[0].ok;
 assert.equal(await record(1,'completed'),false);assert.equal(await record(17,'started'),false);
 assert.equal(await record(1,'started',randomUUID()),false);
 assert.equal(await record(1,'started'),true);assert.equal(await record(1,'started'),false);
 assert.equal(await record(1,'completed'),true);assert.equal(await record(1,'failed'),false);
 const heartbeat=async(token:string)=>((await tenantQuery<{ok:boolean}>(owner,'select heartbeat_skill_shadow_job($1,$2) as ok',[active.id,token]))[0].ok);
 const finish=async(token:string)=>((await tenantQuery<{ok:boolean}>(owner,"select finish_skill_shadow_job($1,$2,'completed',$3,null) as ok",[active.id,token,JSON.stringify({synthetic:true,automaticActivation:false})]))[0].ok);
 assert.equal(await heartbeat(randomUUID()),false);assert.equal(await heartbeat(firstToken),true);
 await pool.query("update agent_skill_shadow_job set lease_until=now()-interval '1 second' where id=$1",[active.id]);
 const second=(await tenantQuery<{lease_token:string;attempts:number}>(owner,'select * from claim_skill_shadow_job()'))[0];assert.equal(second.attempts,2);
 assert.equal(await heartbeat(firstToken),false);assert.equal(await finish(firstToken),false);
  await pool.query("update agent_tool_call set output='{}' where id=$1",[call]);
 const changed=(await pool.query('select skill_shadow_json_hash(output) as hash from agent_tool_call where id=$1',[call])).rows[0].hash;
 assert.notEqual(changed,captured.final_context.receipts[0].outputHash);
  assert.deepEqual((await pool.query('select final_context from agent_skill_shadow_job where id=$1',[active.id])).rows[0].final_context,captured.final_context);
 assert.equal(await finish(second.lease_token),false);
 await pool.query('update agent_tool_call set output=$2 where id=$1',[call,JSON.stringify({status:'success',data:{synthetic:true}})]);
 await pool.query("update agent_skill_shadow_campaign set config='{}' where id=$1",[campaign]);assert.equal(await finish(second.lease_token),false);
 await pool.query('update agent_skill_shadow_campaign set config=$2 where id=$1',[campaign,JSON.stringify({engine:'local-read-only',automaticActivation:false})]);
 assert.equal(await finish(second.lease_token),true);assert.equal(await finish(second.lease_token),false);
 const retryRun=await createRun();await complete(retryRun,'completed');
 const retryJob=(await pool.query('select id from agent_skill_shadow_job where run_id=$1',[retryRun])).rows[0].id;
 for(let attempt=1;attempt<=3;attempt++){
  const retry=(await tenantQuery<{id:string;attempts:number}>(owner,'select * from claim_skill_shadow_job()'))[0];
  assert.equal(retry.id,retryJob);assert.equal(retry.attempts,attempt);
  await pool.query("update agent_skill_shadow_job set lease_until=now()-interval '1 second' where id=$1",[retryJob]);
 }
 assert.equal((await tenantQuery(owner,'select * from claim_skill_shadow_job()')).length,0);
 assert.equal((await pool.query('select state from agent_skill_shadow_job where id=$1',[retryJob])).rows[0].state,'failed');
 assert.equal((await pool.query("select count(*)::int as n from agent_skill_shadow_event where job_id=$1 and kind='lease-retry-limit'",[retryJob])).rows[0].n,1);
 await pool.query('update agent_skill_shadow_campaign set enabled=false where id=$1',[campaign]);
 const disabledRun=await createRun();assert.equal((await pool.query('select count(*)::int as n from agent_skill_shadow_job where run_id=$1',[disabledRun])).rows[0].n,0);
 jobs=await tenantQuery(owner,'select * from agent_skill_shadow_job where owner_id=$1',[owner]);assert.equal(jobs.length,3);
 // Real original evidence through the same current-source path as the worker; still no model calls.
 const plan=await prepareShadowRegistration(owner,{skillId:skill.id,version:1,hours:1,selection:{kind:'whole-read-only-task'}});
 const liveCampaign=randomUUID();
 await pool.query(`insert into agent_skill_shadow_campaign(id,owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
  values($1,$2,$3,1,$4,$5,$6,true,clock_timestamp()+make_interval(hours=>$7))`,[liveCampaign,owner,skill.id,plan.contentHash,plan.sourceHash,JSON.stringify(plan.config),plan.hours]);
 const evidenceRun=await createRun(),evidenceCall=randomUUID(),evidenceArgs={entities:['AP3000','AP3600'],attributes:['ethernet_ports']};
 await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[owner,conversation,'Synthetic prospective analysis only.',JSON.stringify({runId:evidenceRun})]);
 const evidence=await knowledgeCompareTool.execute(evidenceArgs,{userId:owner,runId:evidenceRun,leaseToken:randomUUID(),role:'member'});
 await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
  values($1,$2,$3,$1::uuid::text,'knowledge_compare','1',$4,$5,'read','completed',$6)`,[evidenceCall,owner,evidenceRun,digest(evidenceArgs),JSON.stringify(evidenceArgs),JSON.stringify(evidence)]);
 await complete(evidenceRun,'completed');
 const evidenceJob=(await tenantQuery<{id:string;lease_token:string}>(owner,'select * from claim_skill_shadow_job()'))[0];
 const context={userId:owner,jobId:evidenceJob.id,leaseToken:evidenceJob.lease_token};
 const prepared=await prepareSkillShadow(context);assert.equal(prepared.snapshot.suite.cases[0].receipts.length,1);
 assert.equal(prepared.automaticActivation,false);assert.deepEqual(prepared.observedProductionResult,{reply:'Synthetic result'});
 assert.deepEqual(await prepareSkillShadow(context),prepared);
 await pool.query("update agent_skill_version set validation='{}' where skill_id=$1 and version=1",[skill.id]);
 await assert.rejects(()=>prepareSkillShadow(context),/registration changed/);
 // Restore the exact validation returned by the original import.
 await pool.query('update agent_skill_version set validation=$2 where skill_id=$1 and version=1',[skill.id,JSON.stringify(skill.validation)]);
 await pool.query("update agent_skill_shadow_job set state='queued',lease_token=null,lease_until=null where id=$1",[evidenceJob.id]);
 const oldEndpoint=process.env.OLLAMA_LOCAL_URL;process.env.OLLAMA_LOCAL_URL='http://127.0.0.1:1';
 try{assert.equal((await processNextSkillShadow(owner)).status,'failed');}finally{if(oldEndpoint===undefined)delete process.env.OLLAMA_LOCAL_URL;else process.env.OLLAMA_LOCAL_URL=oldEndpoint;}
 assert.equal((await pool.query('select state from agent_skill_shadow_job where id=$1',[evidenceJob.id])).rows[0].state,'failed');
 const abandonedRun=await createRun();await pool.query('update agent_skill_shadow_campaign set enabled=false where id=$1',[liveCampaign]);
 assert.equal((await tenantQuery(owner,'select * from claim_skill_shadow_job()')).length,0);
 assert.equal((await pool.query('select state from agent_skill_shadow_job where run_id=$1',[abandonedRun])).rows[0].state,'skipped');
 console.log(JSON.stringify({clone:true,prospectiveOnly:true,appRoleLifecycleTrigger:true,lateCampaignCannotBackfill:true,
  pausedTaskNotQueued:true,completedTaskQueuedOnce:true,cancelledTaskSkipped:true,disabledCampaignIgnored:true,
  capturedJournalAndResultHashes:true,immutableCaptureAfterSourceChange:true,tenantIsolation:true,clientCannotForgeCapture:true,
  concurrentClaimOnce:true,expiredLeaseReclaimed:true,staleWorkerRejected:true,changedCaptureCannotComplete:true,changedCampaignCannotComplete:true,
  boundedRestartAttempts:true,retryExhaustionLogged:true,
  actualOriginalEvidenceValidated:true,sourceVersionChangeDenied:true,localModelOfflineRecorded:true,noCloudFallback:true,
  modelCallHashReceipts:true,modelCallPhaseAndLeaseGuards:true,
  disabledPendingCaptureSettled:true,
  modelCalls:0,productionCampaigns:0,workerAcceptance:false}));
}finally{
 const client=await pool.connect();try{
  await client.query('begin');
  for(const table of ['agent_skill_shadow_event','agent_skill_shadow_job','agent_skill_shadow_campaign'])
   if((await client.query('select to_regclass($1) as present',[table])).rows[0].present)await client.query(`delete from ${table} where owner_id=$1`,[owner]);
  await client.query('delete from agent_tool_call where user_id=$1',[owner]);
  await client.query('delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=$1)',[owner]);
  await client.query('delete from agent_skill where owner_id=$1',[owner]);
  await client.query('delete from agent_run where user_id=$1',[owner]);
  await client.query('delete from assistant_message where user_id=$1',[owner]);
  await client.query('delete from assistant_conversation where user_id=$1',[owner]);
  await client.query('delete from app_user where id=$1',[owner]);
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
