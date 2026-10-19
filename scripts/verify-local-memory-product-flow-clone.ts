import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {processLocalMemoryExtraction} from '../src/lib/knowledge/local-memory-extraction';
import {undoMemory,memoryTimeline} from '../src/lib/knowledge/temporal-memory';
nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
process.env.OLLAMA_LOCAL_URL='http://127.0.0.1:11434';
process.env.LANGSMITH_TRACING='false';process.env.LANGCHAIN_TRACING_V2='false';
const nativeFetch=globalThis.fetch.bind(globalThis),directory=`tmp/ma24-real-memory-flow-${randomUUID()}`;
await mkdir(directory,{recursive:true});let chatCalls=0,tagCalls=0;
const localFetch:typeof fetch=async(input,init)=>{
 const target=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
 assert.equal(target.origin,'http://127.0.0.1:11434');assert(['/api/tags','/api/chat'].includes(target.pathname));
 assert.equal(target.search,'');assert.equal(target.hash,'');assert.equal(target.username,'');assert.equal(target.password,'');
 if(target.pathname==='/api/chat'){
  assert(++chatCalls<=6,'Local chat-call cap exceeded');assert.equal(JSON.parse(String(init?.body)).model,'qwen3:8b');
 }else tagCalls++;
 const response=await nativeFetch(target,{...init,redirect:'error'});
 if(target.pathname==='/api/chat')await writeFile(`${directory}/chat-${chatCalls}.json`,await response.clone().text(),{flag:'wx'});
 return response;
};
globalThis.fetch=localFetch;
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),peer=randomUUID(),conversation=randomUUID();
const initial='I prefer long reports.',corrected='I prefer concise reports.';
const formalCounts=async()=>(await pool.query(`select (select count(*)::int from product_fact) product_facts,
 (select count(*)::int from knowledge_fact) knowledge_facts,(select count(*)::int from knowledge_fact_v3) v3_facts,
 (select count(*)::int from lead_scoring_policy) scoring_policies`)).rows[0];
const createJob=async(content:string)=>{
 const run=randomUUID(),message=randomUUID();
 await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
  values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
 await pool.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",[message,owner,conversation,content,JSON.stringify({runId:run})]);
 await pool.query('insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)',[owner,run]);return {run,message};
};
let result:unknown;
try{
 const models=await (await localFetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3000)})).json() as {models:Array<{name:string;digest:string}>};
 assert(models.models.some(model=>model.name==='qwen3:8b'&&model.digest==='500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41'));
 const before=await formalCounts();
 for(const id of [owner,peer])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic local model flow','!','member','active')",[id,`${id}@example.invalid`]);
 await pool.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic local model flow')",[conversation,owner]);
 const first=await createJob(initial);assert.equal(await processLocalMemoryExtraction(owner,first.run,localFetch),'ready');
 const originals=(await pool.query("select id,content,kind,source_receipt,valid_from,valid_until from agent_memory_observation where owner_id=$1",[owner])).rows;
 assert.equal(originals.length,1);const original=originals[0];assert.equal(original.kind,'preference');
 assert.equal(original.source_receipt.sourceQuote,initial);assert.equal(original.source_receipt.messageId,first.message);
 assert.equal(original.valid_from,null);assert.equal(original.valid_until,null);
 const second=await createJob(`I previously said ${initial} That was wrong. ${corrected}`);
 assert.equal(await processLocalMemoryExtraction(owner,second.run,localFetch),'ready');
 const replacements=(await pool.query('select id,content,source_receipt from agent_memory_observation where owner_id=$1 and corrects_id=$2',[owner,original.id])).rows;
 assert.equal(replacements.length,1,'Natural correction must replace the unique prior preference');
 const replacement=replacements[0];assert(['I prefer concise reports','I prefer concise reports.'].includes(replacement.content));
 assert.equal(replacement.source_receipt.recognizer,'local-qwen3-exact-spans-v1');assert.equal(replacement.source_receipt.messageId,second.message);
 for(const id of [original.id,replacement.id])for(const table of ['agent_memory_notice','agent_memory_graph_outbox'])
  assert.equal((await pool.query(`select count(*)::int n from ${table} where observation_id=$1`,[id])).rows[0].n,1);
 const used=chatCalls;assert.equal(await processLocalMemoryExtraction(owner,second.run,localFetch),'ready');assert.equal(chatCalls,used);
 await undoMemory(owner,replacement.id);
 const timeline=await memoryTimeline(owner,100);assert(timeline.find(row=>row.id===replacement.id)?.is_invalidated);
 assert(timeline.find(row=>row.id===original.id)?.is_invalidated,'Undo must not resurrect the original superseded preference');
 assert(!(await memoryTimeline(peer,100)).some(row=>[original.id,replacement.id].includes(row.id)));
 assert.deepEqual(await formalCounts(),before);
 result={passed:true,model:'qwen3:8b',chatCalls,tagCalls,syntheticInputs:[initial,corrected],preferenceAndNaturalCorrectionPersisted:true,
  noticeOutboxExactlyOnce:true,readyReuseWithoutModel:true,undoNoResurrection:true,peerIsolation:true,formalFactAndPolicyCountsUnchanged:true,
  cloudCalls:0,productionWrites:0,rawDirectory:directory};
}finally{
 const client=await pool.connect();
 try{
  await client.query('begin');await client.query('set local session_replication_role=replica');
  for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
  await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)',[owner]);
  for(const table of ['agent_memory_observation','agent_memory_extraction_job'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
  for(const table of ['agent_run_event','assistant_message','agent_run','assistant_conversation'])await client.query(`delete from ${table} where user_id=$1`,[owner]);
  await client.query('delete from app_user where id=any($1::uuid[])',[[owner,peer]]);await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();globalThis.fetch=nativeFetch;}
}
await writeFile(`${directory}/result.json`,JSON.stringify({result,fixtureCleanupCompleted:true},null,2)+'\n');
console.log(JSON.stringify({result,fixtureCleanupCompleted:true}));
