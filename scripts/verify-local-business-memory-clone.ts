import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery,tenantTransaction} from "../src/lib/rag/db";
import {processLocalMemoryExtraction} from "../src/lib/knowledge/local-memory-extraction";
import {processMemoryGraphOutbox} from "../src/lib/knowledge/memory-graph-outbox";
import {graphObservationIds,searchMemoryWithGraph} from "../src/lib/knowledge/memory-graph-search";

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!base||!["localhost","127.0.0.1","::1"].includes(new URL(base).hostname))throw new Error("Local PostgreSQL required");
const state=JSON.parse(await readFile("tmp/ma11-replay-state.json","utf8")) as {database:string};
if(!/^ma11_replay_[a-f0-9]{12}$/.test(state.database))throw new Error("Isolated clone required");
const clone=new URL(base);clone.pathname=`/${state.database}`;
process.env.DATABASE_URL=clone.toString();
const pool=new Pool({connectionString:clone.toString()});
const runId=randomUUID();
const quote="Our distributor signed a contract in 2024.";
let conversationId="";
let messageId="";
let observationIds:string[]=[];
async function cleanGraph(observationId:string):Promise<void>{
  const python=resolve(".venv-graphiti-local",process.platform==="win32"?"Scripts/python.exe":"bin/python");
  await new Promise<void>((done,reject)=>{
    const child=spawn(python,["scripts/cleanup-memory-graph-probe.py"],{cwd:process.cwd(),windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let output="";
    child.stdout.on("data",chunk=>{output+=String(chunk);});
    child.once("error",reject);
    child.once("close",code=>{
      try{if(code!==0||JSON.parse(output).observationId!==observationId)throw new Error("Graph cleanup failed");done();}
      catch(error){reject(error);}
    });
    child.stdin.end(JSON.stringify({ownerId:OWNER_USER_ID,observationId}));
  });
}
async function formalCounts(){
  const result=await pool.query<{product_fact:string;knowledge_fact:string;knowledge_fact_v3:string;lead_scoring_policy:string}>(
    `select (select count(*) from product_fact)::text as product_fact,
      (select count(*) from knowledge_fact)::text as knowledge_fact,
      (select count(*) from knowledge_fact_v3)::text as knowledge_fact_v3,
      (select count(*) from lead_scoring_policy)::text as lead_scoring_policy`);
  return result.rows[0];
}
try{
  const [owner]=await tenantQuery<{id:string}>(OWNER_USER_ID,"select id from app_user where id=$1 and status='active'",[OWNER_USER_ID]);
  if(!owner)throw new Error("Clone owner unavailable");
  const beforeFormal=await formalCounts();
  await tenantTransaction(OWNER_USER_ID,async client=>{
    const conversation=await client.query<{id:string}>("insert into assistant_conversation(user_id,title) values($1,'MA24 isolated extraction probe') returning id",[OWNER_USER_ID]);
    conversationId=conversation.rows[0].id;
    await client.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$4,$5,$6,$7,'completed','main-agent')`,
      [runId,OWNER_USER_ID,conversationId,`ma24-business-memory-${runId}`,runId,JSON.stringify({content:quote,requestKey:runId,attachments:[]}),JSON.stringify({model:"local-test",providers:[],version:"test"})]);
    const message=await client.query<{id:string}>("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4) returning id",
      [OWNER_USER_ID,conversationId,quote,JSON.stringify({runId})]);
    messageId=message.rows[0].id;
    await client.query("insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)",[OWNER_USER_ID,runId]);
  });
  const first=await processLocalMemoryExtraction(OWNER_USER_ID,runId);
  if(first!=="ready")throw new Error(`Extraction did not finish: ${first}`);
  const observations=await tenantQuery<{id:string;kind:string;content:string;confidence:number;valid_from:string|null;valid_until:string|null;source_receipt:Record<string,unknown>}>(OWNER_USER_ID,
    "select id,kind,content,confidence,valid_from,valid_until,source_receipt from agent_memory_observation where owner_id=$1 and source_receipt->>'runId'=$2",[OWNER_USER_ID,runId]);
  observationIds=observations.map(row=>row.id);
  if(observations.length!==1||observations[0].kind!=="business-fact")throw new Error("Expected one internal business observation");
  const item=observations[0];
  if(item.confidence>0.7||item.valid_from!==null||item.valid_until!==null||item.source_receipt.usage!=="unverified-internal-only"||item.source_receipt.sourceQuote!==quote||item.source_receipt.messageId!==messageId)
    throw new Error("Business observation provenance or permission boundary failed");
  const [effects]=await tenantQuery<{notice_count:string;outbox_count:string}>(OWNER_USER_ID,
    `select (select count(*) from agent_memory_notice where observation_id=$1)::text as notice_count,
      (select count(*) from agent_memory_graph_outbox where observation_id=$1)::text as outbox_count`,[item.id]);
  if(effects.notice_count!=="1"||effects.outbox_count!=="1")throw new Error("Notice/outbox missing");
  const graphStatus=await processMemoryGraphOutbox(OWNER_USER_ID,item.id);
  if(graphStatus!=="delivered")throw new Error(`Business memory graph delivery failed: ${graphStatus}`);
  const term="distributor";
  if(!(await graphObservationIds(OWNER_USER_ID,term)).includes(item.id))throw new Error("Business memory graph candidate missing");
  if((await graphObservationIds(randomUUID(),term)).includes(item.id))throw new Error("Cross-account graph candidate leaked");
  const now=new Date().toISOString();
  const graphRead=await searchMemoryWithGraph(OWNER_USER_ID,term,now,now);
  if(graphRead.path!=="graph"||!graphRead.rows.some(row=>row.id===item.id))throw new Error("Business memory graph read failed");
  const postgresRead=await searchMemoryWithGraph(OWNER_USER_ID,term,now,now,{},async()=>{throw new Error("graph-offline-probe");});
  if(postgresRead.path!=="postgres"||!postgresRead.rows.some(row=>row.id===item.id))throw new Error("PostgreSQL graph fallback failed");
  const other=await tenantQuery(randomUUID(),"select id from agent_memory_observation where id=$1",[item.id]);
  if(other.length)throw new Error("Cross-account observation read succeeded");
  const replay=await processLocalMemoryExtraction(OWNER_USER_ID,runId);
  if(replay!=="ready")throw new Error("Ready job replay failed");
  const [job]=await tenantQuery<{status:string;attempt_count:number}>(OWNER_USER_ID,"select status,attempt_count from agent_memory_extraction_job where owner_id=$1 and run_id=$2",[OWNER_USER_ID,runId]);
  if(job.status!=="ready"||job.attempt_count!==1)throw new Error("Job receipt failed");
  if(JSON.stringify(await formalCounts())!==JSON.stringify(beforeFormal))throw new Error("Formal fact or scoring table changed");
  console.log(JSON.stringify({clone:true,localModel:"qwen3:8b",completedTask:true,internalBusinessFact:true,
    unknownBusinessValidity:true,confidenceCap:true,sourceReceipt:true,notice:true,graphOutbox:true,
    graphProjected:true,graphSearch:true,postgresFallback:true,
    crossAccountDenied:true,replayDenied:true,formalFactOrScoreWrites:0}));
}finally{
  let graphCleanupError:unknown=null;
  for(const id of observationIds)try{await cleanGraph(id);}catch(error){graphCleanupError=error;}
  const client=await pool.connect();
  try{
    await client.query("begin");
    await client.query("set local session_replication_role=replica");
    for(const id of observationIds){
      await client.query("delete from agent_memory_notice where observation_id=$1",[id]);
      await client.query("delete from agent_memory_graph_outbox where observation_id=$1",[id]);
      await client.query("delete from agent_memory_conflict where earlier_id=$1 or later_id=$1",[id]);
      await client.query("delete from agent_memory_observation where id=$1 and owner_id=$2",[id,OWNER_USER_ID]);
    }
    await client.query("delete from agent_memory_extraction_job where owner_id=$1 and run_id=$2",[OWNER_USER_ID,runId]);
    if(messageId)await client.query("delete from assistant_message where id=$1 and user_id=$2",[messageId,OWNER_USER_ID]);
    await client.query("delete from agent_run where id=$1 and user_id=$2",[runId,OWNER_USER_ID]);
    if(conversationId)await client.query("delete from assistant_conversation where id=$1 and user_id=$2",[conversationId,OWNER_USER_ID]);
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}
  finally{client.release();await pool.end();await getPool().end();}
  if(graphCleanupError)throw graphCleanupError;
}
