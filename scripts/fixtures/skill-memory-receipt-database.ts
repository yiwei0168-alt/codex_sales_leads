import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {tenantTransaction,withBoundTenantTransaction} from '../../src/lib/rag/db';
import {searchMemoryWithGraph} from '../../src/lib/knowledge/memory-graph-search';
import {revalidateLockedSkillMemoryReceipts} from '../../src/lib/assistant/main/skill-memory-receipt-check';
import {MemoryContextChangedError} from '../../src/lib/assistant/main/memory-message-guard';
import {captureSkillMemoryTimeFence} from '../../src/lib/assistant/main/skill-memory-time-fence';

export async function verifyMemoryReceiptDatabase(pool:Pool,owner:string,other:string){
 const id=randomUUID(),query=`Synthetic receipt expiry ${randomUUID()}`;
 await pool.query(`insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,valid_from,valid_until)
  values($1,$2,'experience',$3,'{}','2000-01-01T00:00:00Z',clock_timestamp()+interval '2 seconds')`,[id,owner,query]);
 await tenantTransaction(owner,client=>withBoundTenantTransaction(client,owner,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  const knownAt=(await client.query('select clock_timestamp() now')).rows[0].now.toISOString();
  const historicalAt='2001-01-01T00:00:00.000Z';
  const current=await searchMemoryWithGraph(owner,query,knownAt,knownAt,{},async()=>[id]);
  assert.equal(current.rows.length,1);assert.equal(current.rows[0].id,id);
  const historical=await searchMemoryWithGraph(owner,query,historicalAt,knownAt,{},async()=>[id]);
  assert.equal(historical.rows.length,1);
  const receipt=(input:Record<string,unknown>,rows:unknown)=>({tool:'memory_observation_search',input,output:{status:'success',data:{rows}}});
  const implicit=receipt({query},current.rows),explicit=receipt({query,businessAt:historicalAt,knownAt},historical.rows);
  const initial=await revalidateLockedSkillMemoryReceipts(client,owner,[implicit,explicit]);
  assert.equal(initial.memoryReceiptCount,2);assert(initial.memoryTimeValidBefore);
  const explicitFence=await captureSkillMemoryTimeFence(client,owner,[explicit]);
  assert.equal(explicitFence.memoryTimeValidBefore,null);
  await client.query('select pg_sleep(2.1)');
  assert.equal((await client.query('select transaction_timestamp()<valid_until old_clock from agent_memory_observation where id=$1',[id])).rows[0].old_clock,true);
  await assert.rejects(revalidateLockedSkillMemoryReceipts(client,owner,[implicit]),MemoryContextChangedError);
  assert.equal((await revalidateLockedSkillMemoryReceipts(client,owner,[explicit])).memoryReceiptCount,1);
 }));
 await assert.rejects(tenantTransaction(other,client=>withBoundTenantTransaction(client,other,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  return revalidateLockedSkillMemoryReceipts(client,other,[{tool:'memory_observation_search',input:{query,businessAt:'2001-01-01T00:00:00.000Z'},
   output:{status:'success',data:{rows:[{id,content:query}]}}}]);
 })),MemoryContextChangedError);
 console.log(JSON.stringify({memoryReceiptDatabase:'passed',sameTransactionImplicitObservationExpiryRejected:true,
  explicitHistoricalTimesPreserved:true,implicitReceiptDeadlineCaptured:true,explicitHistoricalReceiptNotExpiredByWallClock:true,
  transactionTimestampStillBeforeExpiry:true,crossAccountRejected:true,graphServiceCalls:0,modelCalls:0,automaticActivation:false}));
}
