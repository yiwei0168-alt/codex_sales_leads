import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery,tenantTransaction} from "../src/lib/rag/db";
import {observeMemoryInTransaction} from "../src/lib/knowledge/temporal-memory";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
let observationId="",checked=false;
try{
  await tenantTransaction(OWNER_USER_ID,async client=>{
    observationId=await observeMemoryInTransaction(client,OWNER_USER_ID,{kind:"preference",
      content:"Synthetic Graphiti outbox test",sourceReceipt:{type:"ma24-graph-test",id:randomUUID()}});
    const eligible=await client.query("select observation_id from next_memory_graph_outbox() where observation_id=$1",[observationId]);
    if(eligible.rowCount!==1)throw new Error("Graph outbox receipt unavailable");
    const claimed=await client.query(`update agent_memory_graph_outbox
      set lease_token=$2,leased_at=now(),attempt_count=attempt_count+1
      where observation_id=$1 and delivered_at is null and lease_token is null
      returning observation_id`,[observationId,randomUUID()]);
    if(claimed.rowCount!==1)throw new Error("Graph lease failed");
    const hidden=await client.query("select observation_id from next_memory_graph_outbox() where observation_id=$1",[observationId]);
    if(hidden.rowCount!==0)throw new Error("Leased graph receipt remained eligible");
    await client.query("select set_config('app.current_user_id',$1,true)",[randomUUID()]);
    const denied=await client.query("select observation_id from agent_memory_graph_outbox where observation_id=$1",[observationId]);
    if(denied.rowCount!==0)throw new Error("Cross-account graph outbox read succeeded");
    checked=true;
    throw new Error("rollback-ma24-graph-outbox-test");
  });
}catch(error){if(!(error instanceof Error)||error.message!=="rollback-ma24-graph-outbox-test")throw error;}
if(!checked)throw new Error("Graph outbox test did not complete");
const remaining=await tenantQuery(OWNER_USER_ID,"select observation_id from agent_memory_graph_outbox where observation_id=$1",[observationId]);
if(remaining.length)throw new Error("Graph outbox fixture remained after rollback");
console.log(JSON.stringify({local:true,receipt:true,lease:true,crossAccountDenied:true,rolledBack:true}));
await getPool().end();
