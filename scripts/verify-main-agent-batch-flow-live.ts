import {readFile,writeFile,mkdir} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {tenantQuery,getPool} from "../src/lib/rag/db";
import {enqueueRun,getRun} from "../src/lib/assistant/main/repository";
import {executeMainAgentRun,buildMainAgentGraph} from "../src/lib/assistant/main/graph";
import {pollDueModelBatch,batchModelResult} from "../src/lib/assistant/main/model-batch";
import {defaultModelConfig} from "../src/lib/assistant/main/product";
import {loadMemory} from "../src/lib/assistant/main/memory";
import type {ModelMessage} from "../src/lib/assistant/main/contracts";
import {getOpenRouterConfig,openRouterRequestHeaders} from "../src/providers/openrouter";
import {readOpenRouterBatch,matchesBatchModel} from "../src/providers/openrouter-batch";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {recordVerifiedCostObservation} from "../src/lib/billing/reconciliation";
import {reportedDollarsToMicros} from "../src/lib/billing/openrouter-cost-report";
const file="tmp/main-agent-glm-flow.json",url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;if(!url)throw new Error("Database required");
const a=new URL(url),b=new URL(process.env.DATABASE_URL!);assert.equal(`${a.hostname}:${a.port||5432}${a.pathname}`,`${b.hostname}:${b.port||5432}${b.pathname}`);
const admin=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)});
process.env.PRODUCT_FINANCIAL_POLICY="observe";
try {
  await mkdir("tmp",{recursive:true});
  let saved: {userId:string;runId:string}|null=await readFile(file,"utf8").then(JSON.parse).catch(()=>null);
  if(!saved) {
    if(!process.argv.includes("--start"))throw new Error("Explicit --start required for a bounded real public Agent flow");
    const config=defaultModelConfig();assert.equal(config.model,"z-ai/glm-5.3:batch");assert.deepEqual(config.providers,["fireworks"]);
    const userId=randomUUID();
    await admin.query("insert into app_user(id,email,display_name,status) values($1,$2,'Public synthetic GLM flow','disabled')",[userId,`${userId}@example.invalid`]);
    assert.equal((await loadMemory(userId)).length,0,"No private/global memory may enter this public-only probe");
    const run=await enqueueRun(userId,{content:"Public synthetic acceptance task. Call discover_tools exactly once. Then summarize which listed capabilities read knowledge and which require human approval to send mail. Do not use describe_tool or execute_tool, read business records, send mail, or call any other external service.",requestKey:`public-glm-flow-${randomUUID()}`,attachments:[]},config);
    // Ordinary workers cannot claim the fixture before this verifier inspects
    // each returned model action. Calls still use the production durable graph.
    await admin.query("update agent_run set execution_version='public-glm-flow-verifier' where user_id=$1 and id=$2",[userId,run.id]);
    await admin.query("update app_user set status='active' where id=$1",[userId]);
    saved={userId,runId:run.id};await writeFile(file,JSON.stringify(saved)+"\n");
  }
  const {userId,runId}=saved;
  let run=await getRun(userId,runId);assert(run);
  if(process.argv.includes("--reconcile-admission")) {
    const unknown=(await tenantQuery<{id:string;call_id:string;custom_id:string;model:string;submitted_at:string;reservation_id:string;call_key:string}>(userId,
      "select b.*,c.call_key from agent_model_batch b join agent_tool_call c on c.id=b.call_id and c.user_id=b.user_id where b.user_id=$1 and b.run_id=$2 and b.status='unknown' and b.remote_id is null",[userId,runId]))[0];
    assert(unknown,"No unresolved public probe admission");
    const route=getOpenRouterConfig(),created=Math.floor(new Date(unknown.submitted_at).getTime()/1000);
    const list=await fetch(`${route.baseUrl}/batches?limit=100&created_after=${created-2}&created_before=${created+30}`,{headers:openRouterRequestHeaders(route),signal:AbortSignal.timeout(30000),redirect:"error"});
    assert.equal(list.status,200);
    const listed=await list.json();
    const candidates=(listed.data as Array<{id:string;model:string;request_counts:{total:number}}>).filter(v=>matchesBatchModel(v.model,unknown.model)&&v.request_counts.total===1);
    assert.equal(candidates.length,1,"Ambiguous receipt metadata; never attach a guessed batch");
    const receipt=await readOpenRouterBatch(candidates[0].id);
    if(receipt.status!=="completed") {console.log(JSON.stringify({status:"awaiting-original-admission-reconciliation",providerStatus:receipt.status,newSubmissions:0}));process.exitCode=0;}
    else {
      assert(batchModelResult(receipt,{model:unknown.model,customId:unknown.custom_id}),"Exact owned custom ID must match before any repair");
      const thread={configurable:{thread_id:`main-agent:${userId}:${runId}`,checkpoint_ns:""}};
      const graph=buildMainAgentGraph({boundary:async()=>{throw new Error("No execution during repair");},model:async()=>{throw new Error("No execution during repair");},tool:async()=>{throw new Error("No execution during repair");}},new PostgresSaver(getPool(),undefined,{schema:"langgraph"}));
      const snapshot=await graph.getState(thread),step=Number(/^model:(\d+):batch$/.exec(unknown.call_key)?.[1]);
      assert(Number.isSafeInteger(step)&&snapshot.values.status==="partial"&&snapshot.values.steps===step+1&&!snapshot.values.pending.length);
      await admin.query("insert into agent_run_event(user_id,run_id,kind,payload) select user_id,run_id,'public_probe_admission_reconciled',jsonb_build_object('previousOutput',output,'previousMetrics',metrics) from agent_tool_call where user_id=$1 and id=$2",[userId,unknown.call_id]);
      await admin.query("update agent_tool_call set status='started',output=null where user_id=$1 and id=$2",[userId,unknown.call_id]);
      await admin.query("update agent_model_batch set remote_id=$3,status='pending',next_poll_at=now()-interval '1 second' where user_id=$1 and id=$2",[userId,unknown.id,receipt.id]);
      await admin.query("insert into user_spend_budget(user_id,limit_micros) values($1,0) on conflict do nothing",[userId]);
      const identity=createHash("sha256").update(receipt.id).digest("hex");
      await admin.query("update paid_call_reservation set provider_request_hash=$3 where user_id=$1 and id=$2 and provider_request_hash is null",[userId,unknown.reservation_id,identity]);
      await recordVerifiedCostObservation(userId,unknown.reservation_id,{kind:"provider-report",amountMicros:reportedDollarsToMicros(receipt.usage?.cost),complete:false,sourceReferenceHash:createHash("sha256").update(`${identity}:reconciled-public-probe`).digest("hex"),sourceVersion:"public-probe-canonical-model-repair-v1",providerRequestHash:identity});
      await graph.updateState(thread,{steps:step,status:"running",reply:""});
      await admin.query("update agent_run set status='queued',control=null where user_id=$1 and id=$2",[userId,runId]);
      await admin.query("update app_user set status='active' where id=$1",[userId]);
      run=await getRun(userId,runId);assert(run);
    }
  }
  const jobs=await tenantQuery<{id:string;status:string}>(userId,"select id,status from agent_model_batch where user_id=$1 and run_id=$2 order by submitted_at",[userId,runId]);
  for(const job of jobs)if(job.status==="pending")await pollDueModelBatch(job.id);
  const outputs=await tenantQuery<{output:{data?:{message?:ModelMessage}};metrics:Record<string,unknown>}>(userId,"select output,metrics from agent_tool_call where user_id=$1 and run_id=$2 and tool_id='main_model' and status='completed' order by created_at",[userId,runId]);
  const unexpected=outputs.some(o=>o.output?.data?.message?.tool_calls?.some(c=>c.function.name!=="discover_tools"));
  if(unexpected||jobs.length>4) {
    await tenantQuery(userId,"update agent_run set status='cancelled',control='cancel' where user_id=$1 and id=$2",[userId,runId]);
    throw new Error("Public diagnostic stopped before an unexpected action or excessive model turns");
  }
  if(!["completed","cancelled","failed","partial"].includes(run.status)) {
    assert.equal((await loadMemory(userId)).length,0,"Memory added during public probe; stop before next model call");
    const token=randomUUID();
    await tenantQuery(userId,"update agent_run set status='running',control=null,lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2",[userId,runId,token]);
    await executeMainAgentRun(userId,runId,token);
    run=await getRun(userId,runId);assert(run);
  }
  const batches=await tenantQuery(userId,"select status,provider_status,poll_count from agent_model_batch where user_id=$1 and run_id=$2 order by submitted_at",[userId,runId]);
  const metrics=await tenantQuery(userId,"select metrics from agent_tool_call where user_id=$1 and run_id=$2 and tool_id='main_model' order by created_at",[userId,runId]);
  console.log(JSON.stringify({mode:"real-public-main-agent-flow",status:run.status,batches,metrics,unexpectedActions:unexpected,privateInputs:0,sends:0},null,2));
  if(["completed","cancelled","failed","partial"].includes(run.status))await admin.query("update app_user set status='disabled' where id=$1",[userId]);
}finally{await admin.end();await getPool().end();}
