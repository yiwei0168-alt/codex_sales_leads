import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool,tenantTransaction} from '../src/lib/rag/db';
import {observeMemory,memoryAt,memoryConflicts,undoMemory} from '../src/lib/knowledge/temporal-memory';
import {searchMemoryWithGraph} from '../src/lib/knowledge/memory-graph-search';
import {processLocalMemoryExtraction} from '../src/lib/knowledge/local-memory-extraction';
import {proposeExperienceSkillInTransaction} from '../src/lib/knowledge/experience-skill-draft';
import {changeSkill} from '../src/lib/assistant/main/skills';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!base||!['localhost','127.0.0.1','::1'].includes(new URL(base).hostname))throw new Error('Local database required');
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database),'Isolated clone required');
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()});
const owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),cancelledRun=randomUUID();
const marker=`memory-probe-${owner}`,quote='I prefer concise answers for future summaries.';
const children:ChildProcess[]=[];
let stall=true,chatCalls=0,resolveChat:()=>void=()=>{};
const chatStarted=new Promise<void>(done=>{resolveChat=done;});
const server=createServer(async(request,response)=>{
  if(request.url==='/api/tags')return void response.end(JSON.stringify({models:[{name:'qwen3:8b',digest:'500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41'}]}));
  if(request.url!=='/api/chat'){response.statusCode=404;response.end();return;}
  let text='';for await(const chunk of request)text+=String(chunk);
  const input=JSON.parse(text);assert.equal(input.messages.at(-1).content,quote,'Only synthetic fixture may reach this stub');
  chatCalls++;resolveChat();if(stall)return;
  response.end(JSON.stringify({message:{content:JSON.stringify({items:[{memoryKey:marker,content:'Prefers concise future summaries',sourceQuote:quote,confidence:0.9}]})}}));
});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
const address=server.address();assert(address&&typeof address!=='string');
const stubPort=address.port;
function worker(){
  const child=spawn(process.execPath,['--import=tsx/esm','scripts/run-local-memory-worker.ts','--once'],{
    cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,DATABASE_URL:url.toString(),DATABASE_MIGRATION_URL:url.toString(),ENABLE_LOCAL_MEMORY_EXTRACTION:'1',
      OLLAMA_LOCAL_URL:`http://127.0.0.1:${stubPort}`,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'localhost,127.0.0.1,::1'},
  });
  children.push(child);let output='';child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',()=>{});
  const done=new Promise<{code:number|null;output:string}>((accept,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('Synthetic worker timeout'));},30000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);accept({code,output});});
  });
  return {child,done};
}
const now=async()=>String((await pool.query<{now:string}>('select clock_timestamp()::text as now')).rows[0].now);
try{
  await pool.query(await readFile('db/migrations/121_memory_extraction_eligible_queue.sql','utf8'));
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Memory recovery fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Memory recovery fixture')",[conversation,owner]);
  for(const [id,status] of [[cancelledRun,'cancelled'],[run,'completed']]){
    await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}',$5,'main-agent')`,[id,owner,conversation,JSON.stringify({content:quote,requestKey:id,attachments:[]}),status]);
    await pool.query("insert into agent_memory_extraction_job(owner_id,run_id,next_attempt_at,created_at) values($1,$2,'1900-01-01',$3)",[owner,id,id===cancelledRun?'1900-01-01':'1900-01-02']);
  }
  await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",[owner,conversation,quote,JSON.stringify({runId:run})]);
  assert.equal((await pool.query('select * from next_local_memory_extraction_job()')).rows[0].run_id,run,'Cancelled job must not block eligible queue');
  const first=worker();
  let chatTimer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([chatStarted,new Promise<never>((_,reject)=>{chatTimer=setTimeout(()=>reject(new Error('Worker never reached local stub')),20000);})]);}
  finally{clearTimeout(chatTimer);}
  const beforeCrash=(await pool.query('select status,lease_token,attempt_count from agent_memory_extraction_job where run_id=$1',[run])).rows[0];
  assert.equal(beforeCrash.status,'processing');assert.equal(beforeCrash.attempt_count,1);
  first.child.kill();await first.done;
  // Expire only this synthetic lease to avoid a five-minute test sleep.
  await pool.query("update agent_memory_extraction_job set updated_at=now()-interval '6 minutes' where run_id=$1",[run]);
  stall=false;
  const restarted=await worker().done;assert.equal(restarted.code,0);assert(restarted.output.includes(run)&&restarted.output.includes('ready'));
  const after=(await pool.query('select status,lease_token,attempt_count from agent_memory_extraction_job where run_id=$1',[run])).rows[0];
  assert.equal(after.status,'ready');assert.equal(after.lease_token,null);assert.equal(after.attempt_count,2);
  const observations=(await pool.query("select id from agent_memory_observation where owner_id=$1 and source_receipt->>'runId'=$2",[owner,run])).rows;
  assert.equal(observations.length,1);
  for(const table of ['agent_memory_notice','agent_memory_graph_outbox'])assert.equal((await pool.query(`select count(*)::int as n from ${table} where observation_id=$1`,[observations[0].id])).rows[0].n,1);
  assert.equal(await processLocalMemoryExtraction(owner,run,async()=>{throw new Error('Replay must not call model');}),'ready');
  assert.equal((await pool.query('select status from agent_memory_extraction_job where run_id=$1',[cancelledRun])).rows[0].status,'queued');

  const key=`conflict-${marker}`,business='2026-10-01T00:00:00Z';
  const earlier=await observeMemory(owner,{kind:'preference',memoryKey:key,content:`${marker}: short summaries`,sourceReceipt:{type:'synthetic'},validFrom:'2026-01-01T00:00:00Z'});
  const beforeConflict=await now();
  const later=await observeMemory(owner,{kind:'preference',memoryKey:key,content:`${marker}: detailed summaries`,sourceReceipt:{type:'synthetic'},validFrom:'2026-07-01T00:00:00Z'});
  const duringConflict=await now();
  assert((await memoryAt(owner,business,beforeConflict)).some(row=>row.id===earlier));
  assert.equal((await memoryAt(owner,business,duringConflict)).filter(row=>[earlier,later].includes(row.id)).length,0);
  assert((await memoryAt(owner,'2026-06-01T00:00:00Z',duringConflict)).some(row=>row.id===earlier),'Future business conflict must not hide a non-overlapping interval');
  const graph=async()=>[earlier,later];
  assert.equal((await searchMemoryWithGraph(owner,marker,business,duringConflict,{},graph)).rows.length,0);
  assert.equal((await memoryConflicts(owner)).length,1);
  await undoMemory(owner,later);
  const afterUndo=await now();
  assert((await memoryAt(owner,business,afterUndo)).some(row=>row.id===earlier));
  assert.equal((await memoryAt(owner,business,duringConflict)).filter(row=>[earlier,later].includes(row.id)).length,0,'Later undo must not change known-at snapshot');
  assert.equal((await memoryConflicts(owner)).length,0);
  assert.equal((await searchMemoryWithGraph(owner,marker,business,afterUndo,{},async()=>{throw new Error('Graph offline');})).rows[0].id,earlier);
  assert.equal((await searchMemoryWithGraph(randomUUID(),marker,business,afterUndo,{},graph)).rows.length,0);
  const experience='I found comparing original tables reduced errors.',experienceKey=`method-${marker}`;
  let draftId='';
  for(let i=0;i<2;i++){
    const reportRun=randomUUID(),messageId=randomUUID();
    await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}','completed','main-agent')`,[reportRun,owner,conversation,JSON.stringify({content:experience,requestKey:reportRun,attachments:[]})]);
    await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",[messageId,owner,conversation,experience,JSON.stringify({runId:reportRun})]);
    await observeMemory(owner,{kind:'experience',memoryKey:experienceKey,content:experience,sourceReceipt:{type:'local-qwen3-extraction',usage:'unverified-user-experience',sourceQuote:experience,runId:reportRun,messageId}});
    const candidate=await tenantTransaction(owner,client=>proposeExperienceSkillInTransaction(client,owner,experienceKey,experience));
    if(i===0)assert.equal(candidate,null);else{assert(candidate?.created);draftId=candidate.id;}
  }
  const draft=(await pool.query('select scope,enabled,published from agent_skill where id=$1',[draftId])).rows[0];
  assert.deepEqual(draft,{scope:'account',enabled:false,published:false});
  const replayDraft=await tenantTransaction(owner,client=>proposeExperienceSkillInTransaction(client,owner,experienceKey,experience));
  assert.equal(replayDraft?.id,draftId);assert.equal(replayDraft?.created,false);
  await assert.rejects(()=>changeSkill({userId:owner,role:'member'},{id:draftId,version:1,operation:'enable'}),/replay and shadow/);
  assert.equal((await pool.query('select count(*)::int n from agent_skill where owner_id=$1',[owner])).rows[0].n,1);
  console.log(JSON.stringify({clone:true,model:'loopback-stub-not-quality-evaluation',cancelledQueueSkipped:true,workerKilledAndRestarted:true,expiredLeaseRecovered:true,attempts:2,chatCalls,oneObservationNoticeOutbox:true,replayNoModel:true,conflictIsolated:true,knownAtPreserved:true,businessIntervalPreserved:true,undoRestoresSurvivor:true,graphFallbackAndTenantIsolation:true,repeatedExperienceDraft:true,draftReplayIdempotent:true,unreviewedAutoActivationDenied:true,externalCalls:0}));
}finally{
  for(const child of children)if(child.exitCode===null)child.kill();
  server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));
  const client=await pool.connect();
  try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    await client.query('delete from agent_skill_version where skill_id in(select id from agent_skill where owner_id=$1)',[owner]);
    await client.query('delete from agent_skill where owner_id=$1',[owner]);
    await client.query('delete from agent_run_event where user_id=$1',[owner]);
    await client.query('delete from agent_memory_conflict where owner_id=$1',[owner]);
    await client.query('delete from agent_memory_notice where owner_id=$1',[owner]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)',[owner]);
    for(const table of ['agent_memory_observation','agent_memory_extraction_job'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
    for(const table of ['assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
