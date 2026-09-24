import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {tenantTransaction,tenantQuery} from "../src/lib/rag/db";
import {observeMemoryInTransaction} from "../src/lib/knowledge/temporal-memory";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl||!["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
const marker=randomUUID();
let completed=false;
try{
  await tenantTransaction(OWNER_USER_ID,async client=>{
    const first=await observeMemoryInTransaction(client,OWNER_USER_ID,{kind:"preference",content:"Use concise answers",memoryKey:`style:${marker}`,
      sourceReceipt:{type:"local-test",marker,step:1},idempotencyKey:`${marker}:1`,validFrom:"2026-01-01T00:00:00Z"});
    const replay=await observeMemoryInTransaction(client,OWNER_USER_ID,{kind:"preference",content:"Use concise answers",memoryKey:`style:${marker}`,
      sourceReceipt:{type:"local-test",marker,step:1},idempotencyKey:`${marker}:1`,validFrom:"2026-01-01T00:00:00Z"});
    const later=await observeMemoryInTransaction(client,OWNER_USER_ID,{kind:"preference",content:"Use detailed answers",memoryKey:`style:${marker}`,
      sourceReceipt:{type:"local-test",marker,step:2},idempotencyKey:`${marker}:2`,validFrom:"2026-01-01T00:00:00Z"});
    const conflict=await client.query("select id from agent_memory_conflict where owner_id=$1 and earlier_id=$2 and later_id=$3",[OWNER_USER_ID,first,later]);
    const notices=await client.query("select count(*)::int as count from agent_memory_notice where owner_id=$1 and observation_id=any($2::uuid[])",[OWNER_USER_ID,[first,later]]);
    const outbox=await client.query("select count(*)::int as count from agent_memory_graph_outbox where observation_id=any($1::uuid[])",[[first,later]]);
    if(first!==replay||conflict.rowCount!==1||notices.rows[0].count!==2||outbox.rows[0].count!==2)throw new Error("Memory replay, conflict, notice or outbox failed");
    const invalidated=await observeMemoryInTransaction(client,OWNER_USER_ID,{kind:"experience",content:"Undo test memory",
      sourceReceipt:{type:"local-test",marker,step:3},invalidatesId:first,idempotencyKey:`${marker}:undo`});
    const evidence=await client.query("select count(*)::int as count from agent_memory_observation where owner_id=$1 and (id=$2 or id=$3 or id=$4)",[OWNER_USER_ID,first,later,invalidated]);
    if(evidence.rows[0].count!==3)throw new Error("Immutable undo failed");
    try{await observeMemoryInTransaction(client,OWNER_USER_ID,{kind:"experience",content:"Forbidden undo",sourceReceipt:{type:"local-test",marker},invalidatesId:randomUUID()});throw new Error("Cross-account target accepted");}
    catch(error){if(!(error instanceof Error)||error.message!=="Memory target is unavailable")throw error;}
    completed=true;
    throw new Error("rollback-temporal-memory-test");
  });
}catch(error){if(!(error instanceof Error)||error.message!=="rollback-temporal-memory-test")throw error;}
if(!completed)throw new Error("Test transaction did not finish");
const leaked=await tenantQuery(OWNER_USER_ID,"select id from agent_memory_observation where owner_id=$1 and idempotency_key=$2",[OWNER_USER_ID,`${marker}:1`]);
if(leaked.length)throw new Error("Test data remained after rollback");
console.log(JSON.stringify({local:true,idempotency:true,conflict:true,notice:true,outbox:true,undo:true,unknownTargetDenied:true,rolledBack:true}));
