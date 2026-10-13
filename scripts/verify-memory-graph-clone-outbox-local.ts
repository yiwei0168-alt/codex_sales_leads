import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {observeMemory} from "../src/lib/knowledge/temporal-memory";
import {processMemoryGraphOutbox} from "../src/lib/knowledge/memory-graph-outbox";
import {graphObservationIds,searchMemoryWithGraph} from "../src/lib/knowledge/memory-graph-search";

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!base||!["localhost","127.0.0.1","::1"].includes(new URL(base).hostname))throw new Error("Local PostgreSQL required");
const state=JSON.parse(await readFile("tmp/ma11-replay-state.json","utf8")) as {database:string};
if(!/^ma11_replay_[a-f0-9]{12}$/.test(state.database))throw new Error("Isolated clone required");
const clone=new URL(base);clone.pathname=`/${state.database}`;
process.env.DATABASE_URL=clone.toString();
const cleanup=new Pool({connectionString:clone.toString()});
let observationId="";
async function verifyCloneSchema():Promise<void>{
  const {rows}=await cleanup.query<{observation:string|null;outbox:string|null;next_job:string|null}>(
    `select to_regclass('public.agent_memory_observation')::text as observation,
      to_regclass('public.agent_memory_graph_outbox')::text as outbox,
      to_regprocedure('public.next_memory_graph_outbox()')::text as next_job`);
  if(!rows[0]?.observation||!rows[0].outbox||!rows[0].next_job)
    throw new Error('Isolated clone lacks memory graph schema; prepare a fresh clone before this probe');
}
function cleanGraph():Promise<void>{
  return new Promise((done,reject)=>{
    const python=resolve(".venv-graphiti-local",process.platform==="win32"?"Scripts/python.exe":"bin/python");
    const child=spawn(python,["scripts/cleanup-memory-graph-probe.py"],{cwd:process.cwd(),windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let output="";child.stdout.on("data",chunk=>{output+=String(chunk);});
    child.once("error",reject);
    child.once("close",code=>{
      try{if(code!==0||JSON.parse(output).observationId!==observationId)throw new Error("Graph probe cleanup failed");done();}
      catch(error){reject(error);}
    });
    child.stdin.end(JSON.stringify({ownerId:OWNER_USER_ID,observationId}));
  });
}
try{
  await verifyCloneSchema();
  const [owner]=await tenantQuery<{id:string}>(OWNER_USER_ID,"select id from app_user where id=$1 and status='active'",[OWNER_USER_ID]);
  if(!owner)throw new Error("Clone owner unavailable");
  const marker=`MA24 local graph probe ${randomUUID()}`;
  observationId=await observeMemory(OWNER_USER_ID,{kind:"preference",content:marker,
    sourceReceipt:{type:"local-graph-clone-probe",id:randomUUID()}});
  const unavailable=await processMemoryGraphOutbox(OWNER_USER_ID,observationId,async()=>{
    throw new Error("Synthetic local Neo4j outage");
  });
  if(unavailable!=="queued")throw new Error(`Graph outage was not queued: ${unavailable}`);
  const [failed]=await tenantQuery<{delivered_at:Date|null;attempt_count:number;lease_token:string|null;last_error:string;next_attempt_at:Date}>(OWNER_USER_ID,
    "select delivered_at,attempt_count,lease_token,last_error,next_attempt_at from agent_memory_graph_outbox where observation_id=$1",[observationId]);
  if(!failed||failed.delivered_at||failed.attempt_count!==1||failed.lease_token||failed.last_error!=="local_graph_failed"||failed.next_attempt_at<=new Date())
    throw new Error("Graph outage receipt did not retain a delayed retry");
  if(await processMemoryGraphOutbox(OWNER_USER_ID,observationId,async()=>{throw new Error("Retry ran before due");})!=="busy")
    throw new Error("Outbox ignored retry delay");
  // Advance only this isolated clone receipt; production keeps the ten-minute backoff.
  await tenantQuery(OWNER_USER_ID,"update agent_memory_graph_outbox set next_attempt_at=now()-interval '1 second' where observation_id=$1",[observationId]);
  const status=await processMemoryGraphOutbox(OWNER_USER_ID,observationId);
  if(status!=="delivered")throw new Error(`Graph outbox delivery failed: ${status}`);
  if(!(await graphObservationIds(OWNER_USER_ID,marker)).includes(observationId))throw new Error("Graph candidate missing");
  if((await graphObservationIds(randomUUID(),marker)).includes(observationId))throw new Error("Cross-account graph candidate leaked");
  const now=new Date().toISOString();
  const checked=await searchMemoryWithGraph(OWNER_USER_ID,marker,now,now);
  if(checked.path!=="graph"||!checked.rows.some(row=>row.id===observationId))throw new Error("PostgreSQL revalidation failed");
  const [receipt]=await tenantQuery<{delivered_at:Date;attempt_count:number}>(OWNER_USER_ID,
    "select delivered_at,attempt_count from agent_memory_graph_outbox where observation_id=$1",[observationId]);
  if(!receipt?.delivered_at||receipt.attempt_count!==2||await processMemoryGraphOutbox(OWNER_USER_ID,observationId)!=="busy")
    throw new Error("Outbox receipt or replay guard failed");
  console.log(JSON.stringify({local:true,clone:true,projected:true,postgresRevalidated:true,
    crossAccountDenied:true,replayDenied:true,failedProjectionQueued:true,retryDelayRespected:true,
    localGraphRecovered:true,attemptCount:receipt.attempt_count,externalCalls:0}));
}finally{
  try{
    if(observationId)await cleanGraph();
  }finally{
    try{
      if(observationId){
        const client=await cleanup.connect();
        try{
          await client.query("begin");
          await client.query("set local session_replication_role=replica");
          await client.query("delete from agent_memory_notice where observation_id=$1",[observationId]);
          await client.query("delete from agent_memory_graph_outbox where observation_id=$1",[observationId]);
          await client.query("delete from agent_memory_observation where id=$1 and owner_id=$2",[observationId,OWNER_USER_ID]);
          await client.query("commit");
        }catch(error){await client.query("rollback");throw error;}finally{client.release();}
      }
    }finally{await cleanup.end();await getPool().end();}
  }
}
