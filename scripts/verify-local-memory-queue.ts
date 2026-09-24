import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool,tenantQuery,tenantTransaction} from "../src/lib/rag/db";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const id=randomUUID(),requestKey=`ma24-memory-${id}`;
let checked=false;
try{
  await tenantTransaction(OWNER_USER_ID,async client=>{
    const conversation=await client.query<{id:string}>("insert into assistant_conversation(user_id,title) values($1,'MA24 local queue test') returning id",[OWNER_USER_ID]);
    await client.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$4,$5,$6,$7,'completed','main-agent')`,
      [id,OWNER_USER_ID,conversation.rows[0].id,requestKey,id,JSON.stringify({content:"Synthetic local preference",requestKey,attachments:[]}),JSON.stringify({model:"local-test",providers:[],version:"test"})]);
    await client.query("insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)",[OWNER_USER_ID,id]);
    const queue=await client.query("select status,attempt_count from agent_memory_extraction_job where owner_id=$1 and run_id=$2",[OWNER_USER_ID,id]);
    const next=await client.query("select owner_id,run_id from next_local_memory_extraction_job()");
    if(queue.rows[0]?.status!=="queued"||queue.rows[0]?.attempt_count!==0||!next.rows.length)throw new Error("Queue or worker receipt unavailable");
    await client.query("select set_config('app.current_user_id',$1,true)",[randomUUID()]);
    const denied=await client.query("select run_id from agent_memory_extraction_job where run_id=$1",[id]);
    await client.query("select set_config('app.current_user_id',$1,true)",[OWNER_USER_ID]);
    if(denied.rowCount!==0)throw new Error("Cross-account queue read succeeded");
    checked=true;
    throw new Error("rollback-local-memory-queue-test");
  });
}catch(error){if(!(error instanceof Error)||error.message!=="rollback-local-memory-queue-test")throw error;}
if(!checked)throw new Error("Queue test did not complete");
const leaked=await tenantQuery(OWNER_USER_ID,"select run_id from agent_memory_extraction_job where owner_id=$1 and run_id=$2",[OWNER_USER_ID,id]);
if(leaked.length)throw new Error("Queue fixture remained after rollback");
console.log(JSON.stringify({local:true,queued:true,workerReceipt:true,crossAccountDenied:true,rolledBack:true}));
await getPool().end();
