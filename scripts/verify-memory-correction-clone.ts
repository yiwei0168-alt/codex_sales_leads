import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {observeMemory,memoryAt,memoryTimeline,memoryConflicts,undoMemory} from '../src/lib/knowledge/temporal-memory';
import {correctMemory} from '../src/lib/knowledge/memory-correction';
import {searchMemoryWithGraph} from '../src/lib/knowledge/memory-graph-search';

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(base&&['localhost','127.0.0.1','::1'].includes(new URL(base).hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8')) as {database:string};
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
const url=new URL(base);url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),marker=`correction-${owner}`;
const now=async()=>String((await pool.query('select clock_timestamp()::text as now')).rows[0].now);
try{
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Correction fixture','!','member','active')",[owner,`${owner}@example.invalid`]);
  const old=await observeMemory(owner,{kind:'business-fact',content:`${marker} old value`,memoryKey:marker,
    sourceReceipt:{type:'synthetic-report'},marketCodes:['DE'],validFrom:'2026-01-01T00:00:00Z'});
  const before=await now(),content=`${marker} corrected value`;
  const replacement=await correctMemory(owner,{id:old,content,reason:'Synthetic correction'});
  assert.equal(await correctMemory(owner,{id:old,content,reason:'Synthetic correction'}),replacement);
  const after=await now();
  assert((await memoryAt(owner,after,before,{marketCode:'DE'})).some(row=>row.id===old));
  const current=await memoryAt(owner,after,after,{marketCode:'DE'});
  assert(current.some(row=>row.id===replacement));assert(!current.some(row=>row.id===old));
  assert.equal((await memoryAt(owner,after,after,{marketCode:'FR'})).length,0);
  assert.equal((await memoryConflicts(owner)).length,0);
  const graph=await searchMemoryWithGraph(owner,marker,after,after,{marketCode:'DE'},async()=>[old]);
  assert.equal(graph.path,'postgres');assert.equal(graph.rows[0].id,replacement);
  await assert.rejects(()=>correctMemory(randomUUID(),{id:old,content:'Other account'}),/unavailable/);
  await assert.rejects(()=>correctMemory(owner,{id:old,content:'Stale client edit'}),/version changed/);
  await assert.rejects(()=>undoMemory(owner,old),/version changed/);
  assert.equal((await pool.query('select count(*)::int n from agent_memory_notice where observation_id=$1',[replacement])).rows[0].n,1);
  assert.equal((await pool.query('select count(*)::int n from agent_memory_graph_outbox where observation_id=$1',[replacement])).rows[0].n,1);
  const unknown=await observeMemory(owner,{kind:'preference',content:'Unknown date original',sourceReceipt:{type:'synthetic'}});
  const unknownNew=await correctMemory(owner,{id:unknown,content:'Unknown date corrected'});
  assert.equal((await memoryTimeline(owner)).find(row=>row.id===unknownNew)?.valid_from,null);
  const race=await observeMemory(owner,{kind:'preference',content:'Concurrent original',sourceReceipt:{type:'synthetic'},memoryKey:`race-${marker}`});
  const outcomes=await Promise.allSettled([correctMemory(owner,{id:race,content:'Concurrent first'}),correctMemory(owner,{id:race,content:'Concurrent second'})]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(result=>result.status==='rejected'&&/version changed/.test(String(result.reason))).length,1);
  const undoRace=await observeMemory(owner,{kind:'preference',content:'Undo race original',sourceReceipt:{type:'synthetic'},memoryKey:`undo-race-${marker}`});
  const undoOutcomes=await Promise.allSettled([correctMemory(owner,{id:undoRace,content:'Undo race correction'}),undoMemory(owner,undoRace)]);
  assert.equal(undoOutcomes.filter(result=>result.status==='fulfilled').length,1);
  await undoMemory(owner,replacement);
  const final=await memoryAt(owner,await now(),await now(),{marketCode:'DE'});
  assert(!final.some(row=>[old,replacement].includes(row.id)),'Undo must not silently revive superseded content');
  assert((await memoryAt(owner,after,after,{marketCode:'DE'})).some(row=>row.id===replacement),'Undo cannot alter historical known-at');
  console.log(JSON.stringify({clone:true,correction:true,idempotentNoticeOutbox:true,scopePreserved:true,unknownDatesPreserved:true,
    knownAtPreserved:true,graphStaleCandidateRejected:true,concurrentCorrectionAndUndo:true,crossAccountDenied:true,modelCalls:0}));
}finally{
  const client=await pool.connect();
  try{
    await client.query('begin');await client.query('set local session_replication_role=replica');
    for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=$1`,[owner]);
    await client.query('delete from agent_memory_graph_outbox where observation_id in(select id from agent_memory_observation where owner_id=$1)',[owner]);
    await client.query('delete from agent_memory_observation where owner_id=$1',[owner]);
    await client.query('delete from app_user where id=$1',[owner]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
}
