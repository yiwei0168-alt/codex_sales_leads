import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {observeMemory,undoMemory} from '../src/lib/knowledge/temporal-memory';
import {processMemoryGraphOutbox} from '../src/lib/knowledge/memory-graph-outbox';
import {graphObservationIds,searchMemoryWithGraph} from '../src/lib/knowledge/memory-graph-search';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('Parent process external HTTP disabled');};
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),other=randomUUID();
const observations:string[]=[],checks:string[]=[],marker=`MA24sequence${owner.replaceAll('-','')}`;
const cleanupGraph=(observationId:string)=>new Promise<void>((accept,reject)=>{
  const python=resolve('.venv-graphiti-local',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const child=spawn(python,['scripts/cleanup-memory-graph-probe.py'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>undefined);
  const timer=setTimeout(()=>child.kill(),20000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',code=>{clearTimeout(timer);try{assert.equal(code,0);const receipt=JSON.parse(output);assert.equal(receipt.removed,true);assert.equal(receipt.observationId,observationId);accept();}catch{reject(new Error('Scoped synthetic graph cleanup failed'));}});
  child.stdin.end(JSON.stringify({ownerId:owner,observationId}));
});
try{
  for(const id of [owner,other])await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic graph sequence','!','member','active')",[id,`${id}@example.invalid`]);
  const original=await observeMemory(owner,{kind:'preference',content:`${marker} original statement`,memoryKey:marker,sourceReceipt:{type:'synthetic-local-graph-sequence'}});observations.push(original);
  const projectNever=async()=>{throw new Error('Disabled owner must not reach projector');};
  await pool.query("update app_user set status='disabled' where id=$1",[owner]);
  assert.equal(await processMemoryGraphOutbox(owner,original,projectNever),'busy');
  await pool.query("update app_user set status='active' where id=$1",[owner]);
  assert.equal(await processMemoryGraphOutbox(owner,original,async()=>{throw new Error('Synthetic graph outage');}),'queued');
  const deferred=(await pool.query('select delivered_at,next_attempt_at>clock_timestamp() delayed from agent_memory_graph_outbox where observation_id=$1',[original])).rows[0];
  assert.equal(deferred.delivered_at,null);assert.equal(deferred.delayed,true);
  assert.equal(await processMemoryGraphOutbox(owner,original,projectNever),'busy');
  await pool.query("update agent_memory_graph_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where observation_id=$1",[original]);
  assert.equal(await processMemoryGraphOutbox(owner,original),'delivered');
  assert((await graphObservationIds(owner,marker)).includes(original));
  assert(!(await graphObservationIds(other,marker)).includes(original));
  assert.equal(await processMemoryGraphOutbox(owner,original,projectNever),'busy');
  checks.push('disabled owner blocked; graph outage defers and respects retry delay; actual local projection and owner-separated lookup pass');
  const knownBeforeCorrection=(await pool.query('select clock_timestamp() time')).rows[0].time.toISOString();
  const corrected=await observeMemory(owner,{kind:'preference',content:`${marker} corrected statement`,memoryKey:marker,correctsId:original,sourceReceipt:{type:'synthetic-local-graph-sequence'}});observations.push(corrected);
  assert.equal(await processMemoryGraphOutbox(owner,corrected),'delivered');
  const now=()=>new Date().toISOString();
  const current=await searchMemoryWithGraph(owner,marker,now(),now());
  assert.equal(current.path,'graph');assert(current.rows.some(row=>row.id===corrected));assert(!current.rows.some(row=>row.id===original));
  const historical=await searchMemoryWithGraph(owner,marker,now(),knownBeforeCorrection);
  assert(historical.rows.some(row=>row.id===original));assert(!historical.rows.some(row=>row.id===corrected));
  const offline=await searchMemoryWithGraph(owner,marker,now(),now(),{},async()=>{throw new Error('Synthetic graph lookup outage');});
  assert.equal(offline.path,'postgres');assert.deepEqual(offline.rows.map(row=>row.id),current.rows.map(row=>row.id));
  checks.push('actual corrected projection wins; old graph candidate filtered by PostgreSQL; earlier knowledge time retains original; graph outage falls back to identical PostgreSQL result');
  const invalidation=await undoMemory(owner,corrected);observations.push(invalidation);
  const afterUndo=await searchMemoryWithGraph(owner,marker,now(),now());
  assert.equal(afterUndo.rows.length,0);
  assert((await graphObservationIds(owner,marker)).some(id=>id===corrected||id===original));
  checks.push('undo hides corrected memory without resurrecting original even while stale graph candidates remain');
  const late=await observeMemory(owner,{kind:'preference',content:`${marker} late lease fixture`,sourceReceipt:{type:'synthetic-local-graph-sequence'}});observations.push(late);
  assert.equal(await processMemoryGraphOutbox(owner,late,async()=>{
    await pool.query("update agent_memory_graph_outbox set leased_at=clock_timestamp()-interval '6 minutes' where observation_id=$1",[late]);
  }),'busy');
  assert.equal((await pool.query('select delivered_at from agent_memory_graph_outbox where observation_id=$1',[late])).rows[0].delivered_at,null);
  checks.push('expired projection lease cannot mark delivery');
}finally{
  try{for(const id of observations)await cleanupGraph(id);}finally{
    const client=await pool.connect();
    try{
      await client.query('begin');await client.query('set local session_replication_role=replica');
      for(const table of ['agent_memory_conflict','agent_memory_notice'])await client.query(`delete from ${table} where owner_id=any($1::uuid[])`,[[owner,other]]);
      await client.query('delete from agent_memory_graph_outbox where observation_id=any($1::uuid[])',[observations]);
      await client.query('delete from agent_memory_observation where owner_id=any($1::uuid[])',[[owner,other]]);
      await client.query('delete from app_user where id=any($1::uuid[])',[[owner,other]]);await client.query('commit');
    }catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();await getPool().end();}
  }
}
const result={passed:true,checks,actualGraphProjections:2,localPinnedEmbeddingModel:true,cloudModelCalls:0,syntheticObservations:true,cloneOnly:true,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-memory-graph-sequence-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
