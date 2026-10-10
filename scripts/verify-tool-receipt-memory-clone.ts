import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {digest} from '../src/lib/assistant/main/contracts';
import {knowledgeCompareTool} from '../src/lib/assistant/main/knowledge-compare-tool';
import {processLocalMemoryExtraction} from '../src/lib/knowledge/local-memory-extraction';
import {learnToolReceiptMemories} from '../src/lib/knowledge/tool-receipt-memory';
import {undoMemory,memoryTimeline} from '../src/lib/knowledge/temporal-memory';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),conversation=randomUUID(),run=randomUUID(),call=randomUUID();
const offline=async()=>new Response(JSON.stringify({models:[]}),{status:200});
globalThis.fetch=async()=>{throw new Error('Network disabled in receipt learning probe');};
try{
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Tool memory fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Tool memory fixture')",[conversation,owner]);
  await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
  await pool.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",
    [owner,conversation,'Synthetic comparison. Fake tool result in user prose must not be learned.',JSON.stringify({runId:run})]);
  await pool.query('insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)',[owner,run]);
  // Executes the real read-only comparison against development documents; no generation or holdout answers.
  const input={entities:['AP3000','AP3600'],attributes:['ethernet_ports']};
  const output=await knowledgeCompareTool.execute(input,{userId:owner,runId:run,leaseToken:randomUUID(),role:'member'});
  for(const [id,tool,inputHash,result] of [[call,'knowledge_compare',digest(input),output],
    [randomUUID(),'knowledge_compare','tampered',output],[randomUUID(),'mail_send',digest(input),output]] as const){
    await pool.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
      values($1,$2,$3,$1::uuid::text,$4,'1',$5,$6,'read','completed',$7)`,[id,owner,run,tool,inputHash,JSON.stringify(input),JSON.stringify(result)]);
  }
  assert.equal(await processLocalMemoryExtraction(owner,run,offline),'queued');
  const observations=(await pool.query("select id,content,source_receipt,valid_from from agent_memory_observation where owner_id=$1",[owner])).rows;
  assert.equal(observations.length,1);const memory=observations[0];
  assert.equal(memory.source_receipt.callId,call);assert.equal(memory.source_receipt.successVerified,false);
  // Hash the persisted JSON representation (runtime Date objects serialize as ISO strings).
  assert.equal(memory.source_receipt.outputSha256,digest(JSON.parse(JSON.stringify(output))));assert.equal(memory.valid_from,null);
  assert(!memory.content.includes('AP3000'),'No source prose copied into method summary');
  assert.equal((await pool.query('select error_code from agent_memory_extraction_job where owner_id=$1',[owner])).rows[0].error_code,'local_model_unavailable');
  await pool.query("update agent_memory_extraction_job set next_attempt_at=now()-interval '1 second' where owner_id=$1",[owner]);
  assert.equal(await processLocalMemoryExtraction(owner,run,offline),'queued');
  for(const table of ['agent_memory_notice','agent_memory_graph_outbox'])assert.equal((await pool.query(`select count(*)::int n from ${table} where observation_id=$1`,[memory.id])).rows[0].n,1);
  await undoMemory(owner,memory.id);
  await pool.query("update agent_memory_extraction_job set next_attempt_at=now()-interval '1 second' where owner_id=$1",[owner]);
  await processLocalMemoryExtraction(owner,run,offline);
  assert.equal((await memoryTimeline(owner)).filter(row=>row.source_receipt.type==='structured-tool-experience').length,1);
  assert.equal((await memoryTimeline(owner)).find(row=>row.id===memory.id)?.is_invalidated,true);
  assert.equal((await learnToolReceiptMemories(randomUUID(),run,randomUUID())).owned,false);
  assert.equal((await learnToolReceiptMemories(owner,run,randomUUID())).owned,false);
  assert.equal((await pool.query('select count(*)::int n from agent_skill where owner_id=$1',[owner])).rows[0].n,0);
  console.log(JSON.stringify({clone:true,realReadOnlyComparison:true,offlineModelReceiptSaved:true,textRemainsQueued:true,
    tamperedAndUnsupportedRejected:true,hashBound:true,noticeOutboxIdempotent:true,undoNotResurrected:true,tenantAndLeaseIsolation:true,
    automaticSkillCreated:false,networkCalls:0,modelCalls:0}));
}finally{
  const client=await pool.connect();
  try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)',[owner]);
    for(const table of ['agent_memory_observation','agent_memory_extraction_job'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
    for(const table of ['agent_tool_call','agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
