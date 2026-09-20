import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {enqueueRun,finishRun} from "../src/lib/assistant/main/repository";
import {requestDurableBatchModel,pollDueModelBatch,ModelBatchPending} from "../src/lib/assistant/main/model-batch";
import {withProductSpend} from "../src/lib/billing/context";
import type {ExecutionContext,ModelMessage} from "../src/lib/assistant/main/contracts";
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;if(!url)throw new Error("Database required");
const parsed=new URL(url),runtime=new URL(process.env.DATABASE_URL!);
assert.equal(`${parsed.hostname}:${parsed.port||5432}${parsed.pathname}`,`${runtime.hostname}:${runtime.port||5432}${runtime.pathname}`);
const admin=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)}),owners=[randomUUID(),randomUUID()];
process.env.PRODUCT_FINANCIAL_POLICY="observe";
const config={model:"z-ai/glm-5.3:batch",providers:["fireworks"],version:"synthetic-batch-db"};
const messages:ModelMessage[]=[{role:"user",content:"Synthetic batch fixture, no network"}];
let checks=0,submissions=0,polls=0;
try {
  for(const id of owners)await admin.query("insert into app_user(id,email,display_name) values($1,$2,'Synthetic batch database')",[id,`${id}@example.invalid`]);
  const run=await enqueueRun(owners[0],{content:"Synthetic batch database",requestKey:randomUUID(),attachments:[]},config);
  const context:ExecutionContext={userId:owners[0],runId:run.id,role:"member",leaseToken:randomUUID()};
  await tenantQuery(owners[0],"update agent_run set status='running',lease_token=$3,lease_until=now()+interval '5 minutes' where user_id=$1 and id=$2",[owners[0],run.id,context.leaseToken]);
  const remote=`batch_${randomUUID()}`;let customId="";
  const response=(status:string)=>({id:remote,model:"z-ai/glm-5.3",endpoint:"/v1/chat/completions",status,request_counts:{total:1,completed:status==="completed"?1:0,failed:0},
    usage:status==="completed"?{prompt_tokens:20,completion_tokens:10,cost:0.000036}:null,
    results:status==="completed"?[{custom_id:customId,response:{status_code:200,body:{choices:[{message:{role:"assistant",content:"Synthetic result"},finish_reason:"stop"}]}}}]:null});
  const submit:typeof fetch=async(_url,init)=>{submissions++;const payload=JSON.parse(String(init?.body));customId=payload.requests[0].custom_id;assert.equal(payload.model,"z-ai/glm-5.3");return Response.json(response("validating"),{status:202});};
  const invoke=()=>withProductSpend(owners[0],"main-agent-batch",()=>requestDurableBatchModel(context,messages,0,0,config,submit),run.id);
  await assert.rejects(invoke(),ModelBatchPending);checks++;
  const jobs=await tenantQuery<{id:string;call_id:string;reservation_id:string}>(owners[0],"select id,call_id,reservation_id from agent_model_batch where user_id=$1 and run_id=$2",[owners[0],run.id]);
  assert.equal(jobs.length,1);assert.equal(submissions,1);checks++;
  assert.equal((await tenantQuery(owners[1],"select id from agent_model_batch where id=$1",[jobs[0].id])).length,0);checks++;
  await assert.rejects(invoke(),ModelBatchPending);assert.equal(submissions,1);checks++;
  const reservations=await tenantQuery<{n:number}>(owners[0],"select count(*)::int n from paid_call_reservation where user_id=$1 and operation_id=$2",[owners[0],run.id]);
  assert.equal(reservations[0].n,1);checks++;
  const due=()=>tenantQuery(owners[0],"update agent_model_batch set next_poll_at=now()-interval '1 second' where user_id=$1 and id=$2",[owners[0],jobs[0].id]);
  await due();
  await pollDueModelBatch(jobs[0].id,async()=>{polls++;return Response.json(response("in_progress"));});
  assert.equal((await tenantQuery<{output:unknown}>(owners[0],"select output from agent_tool_call where user_id=$1 and id=$2",[owners[0],jobs[0].call_id]))[0].output,null);checks++;
  assert.equal((await tenantQuery<{status:string}>(owners[0],"select status from paid_call_reservation where user_id=$1 and id=$2",[owners[0],jobs[0].reservation_id]))[0].status,"reserved");checks++;
  await due();await pollDueModelBatch(jobs[0].id,async()=>{polls++;return Response.json(response("completed"));});
  assert.equal((await invoke()).content,"Synthetic result");assert.equal(submissions,1);checks++;
  const settled=(await tenantQuery<{status:string;reported_micros:string;metrics:{inputTokens:number;validOutputItems:number}}>(owners[0],"select status,reported_micros::text,metrics from paid_call_reservation where user_id=$1 and id=$2",[owners[0],jobs[0].reservation_id]))[0];
  assert.equal(settled.status,"reported");assert.equal(settled.reported_micros,"36");assert.equal(settled.metrics.inputTokens,20);checks++;
  assert.equal(await pollDueModelBatch(jobs[0].id,async()=>{throw new Error("Must not poll terminal batch");}),false);checks++;
  // Second submitted step is cancelled locally. Its late final usage still gets
  // saved, while no model planning or tool execution is resumed.
  const second=()=>withProductSpend(owners[0],"main-agent-batch",()=>requestDurableBatchModel(context,[...messages,{role:"user",content:"Second synthetic step"}],1,0,config,async(_url,init)=>{
    submissions++;customId=JSON.parse(String(init?.body)).requests[0].custom_id;return Response.json({id:`${remote}_late`,status:"validating"},{status:202});}),run.id);
  await assert.rejects(second(),ModelBatchPending);checks++;
  const late=(await tenantQuery<{id:string;reservation_id:string}>(owners[0],"select id,reservation_id from agent_model_batch where user_id=$1 and run_id=$2 and id<>$3",[owners[0],run.id,jobs[0].id]))[0];
  await finishRun(context,"cancelled","Synthetic cancellation");
  await tenantQuery(owners[0],"update agent_model_batch set next_poll_at=now()-interval '1 second' where user_id=$1 and id=$2",[owners[0],late.id]);
  await pollDueModelBatch(late.id,async()=>{polls++;return Response.json({...response("completed"),id:`${remote}_late`});});
  assert.equal((await tenantQuery<{status:string}>(owners[0],"select status from agent_run where user_id=$1 and id=$2",[owners[0],run.id]))[0].status,"cancelled");checks++;
  assert.equal((await tenantQuery<{status:string}>(owners[0],"select status from agent_model_batch where user_id=$1 and id=$2",[owners[0],late.id]))[0].status,"completed");checks++;
  console.log(JSON.stringify({passed:checks,simulatedSubmissions:submissions,simulatedPolls:polls,realProviderCalls:0,customerDataModified:false}));
}finally {
  for(const table of ["agent_model_batch","agent_run_event","agent_tool_call","agent_approval","agent_run","assistant_message","assistant_conversation","paid_cost_observation","paid_call_reservation"])await admin.query(`delete from ${table} where user_id=any($1::uuid[])`,[owners]);
  await admin.query("delete from app_user where id=any($1::uuid[])",[owners]);await admin.end();await getPool().end();
}
