import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery,tenantTransaction} from "../src/lib/rag/db";
import {startVectorlessSession} from "../src/lib/knowledge/vectorless-session";
import {vectorlessTools} from "../src/lib/assistant/main/vectorless-tools";

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!base||!["localhost","127.0.0.1","::1"].includes(new URL(base).hostname))throw new Error("Local PostgreSQL required");
const state=JSON.parse(await readFile("tmp/ma11-replay-state.json","utf8")) as {database:string};
if(!/^ma11_replay_[a-f0-9]{12}$/.test(state.database))throw new Error("Isolated clone required");
const clone=new URL(base);clone.pathname=`/${state.database}`;
process.env.DATABASE_URL=clone.toString();
const pool=new Pool({connectionString:clone.toString()});
const runId=randomUUID(),otherRunId=randomUUID();
let conversationId="",sessionId="";
function migrateClone():Promise<void>{
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,["scripts/run-tsx.cjs","scripts/migrate.ts"],
      {cwd:process.cwd(),windowsHide:true,env:{...process.env,DATABASE_URL:clone.toString(),DATABASE_MIGRATION_URL:clone.toString()},
        stdio:["ignore","pipe","pipe"]});
    let error="";child.stderr.on("data",chunk=>{error+=String(chunk);});child.stdout.on("data",()=>{});
    child.once("error",reject);child.once("close",code=>code===0?done():reject(new Error(error.slice(-500)||`clone-migrate-exit-${code}`)));
  });
}
try{
  await migrateClone();
  await tenantTransaction(OWNER_USER_ID,async client=>{
    const conversation=await client.query<{id:string}>(
      "insert into assistant_conversation(user_id,title) values($1,'MA24 shadow budget probe') returning id",[OWNER_USER_ID]);
    conversationId=conversation.rows[0].id;
    for(const id of [runId,otherRunId])await client.query(`insert into agent_run
      (id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$4,$5,$6,$7,'running','main-agent')`,
      [id,OWNER_USER_ID,conversationId,`ma24-vectorless-budget-${id}`,id,
        JSON.stringify({content:"Compare SFP and SFP+",requestKey:id,attachments:[]}),
        JSON.stringify({model:"local-test",providers:[],version:"test"})]);
  });
  sessionId=await startVectorlessSession(OWNER_USER_ID,"Compare SFP and SFP+",runId);
  if(await startVectorlessSession(OWNER_USER_ID,"Compare SFP and SFP+",runId)!==sessionId)
    throw new Error("Same Agent run created a second session");
  let changedQuestionRejected=false;
  try{await startVectorlessSession(OWNER_USER_ID,"Another question",runId);}catch{changedQuestionRejected=true;}
  if(!changedQuestionRejected)throw new Error("Same run escaped by changing question");
  const search=vectorlessTools.find(tool=>tool.id==="vectorless_search")!;
  let crossRunRejected=false;
  try{await search.execute({sessionId,filters:{}},{userId:OWNER_USER_ID,runId:otherRunId,
    leaseToken:randomUUID(),role:"member"});}catch{crossRunRejected=true;}
  if(!crossRunRejected)throw new Error("Another Agent run reused the session");
  const [count]=await tenantQuery<{count:string}>(OWNER_USER_ID,
    "select count(*)::text as count from knowledge_retrieval_session where owner_id=$1 and agent_run_id=$2",[OWNER_USER_ID,runId]);
  if(count.count!=="1")throw new Error("Expected one task-bound retrieval budget");
  console.log(JSON.stringify({clone:true,oneSessionPerAgentRun:true,questionChangeDenied:true,
    crossRunReuseDenied:true,sessionBudgetShared:true,externalCalls:0}));
}finally{
  const client=await pool.connect();
  try{
    await client.query("begin");await client.query("set local session_replication_role=replica");
    if(sessionId){
      await client.query("delete from knowledge_retrieval_step where session_id=$1",[sessionId]);
      await client.query("delete from knowledge_retrieval_session where id=$1 and owner_id=$2",[sessionId,OWNER_USER_ID]);
    }
    await client.query("delete from agent_run where id=any($1::uuid[]) and user_id=$2",[[runId,otherRunId],OWNER_USER_ID]);
    if(conversationId)await client.query("delete from assistant_conversation where id=$1 and user_id=$2",[conversationId,OWNER_USER_ID]);
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}
  finally{client.release();await pool.end();await getPool().end();}
}
