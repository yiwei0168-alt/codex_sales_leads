import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { plan, candidate, correctedCandidate } from "./workflow-recovery-fixtures";

nextEnv.loadEnvConfig(process.cwd());
const { getPool,tenantTransaction } = await import("../src/lib/rag/db");
const {recordWorkflowCompletion,completeWorkflowJob,failWorkflowJob}=await import("../src/lib/leads/workflow/job-completion");
const { buildLeadWorkflowGraph } = await import("../src/lib/leads/workflow/graph");
const { confirmAndQueueLeadWorkflow, claimLeadWorkflowByAction, executeClaimedLeadWorkflow } = await import("../src/lib/leads/workflow/jobs");
const { setSpendBudget, setTaskSpendBudget, reservePaidCall, settlePaidCall } = await import("../src/lib/billing/repository");
const application = process.env.DATABASE_URL, migration = process.env.DATABASE_MIGRATION_URL;
if (!application || !migration) throw new Error("Both database connections are required");
const a = new URL(application), m = new URL(migration);
if (a.hostname !== m.hostname || (a.port || "5432") !== (m.port || "5432") || a.pathname !== m.pathname) throw new Error("Fixture database mismatch");
const pool = new Pool({ connectionString: databaseConnectionString(migration), ssl: databaseSslConfiguration(migration) });
const userId = randomUUID(), workspaceId = randomUUID(), conversationId = randomUUID(), actionId = randomUUID();
const email = `recovery-guard-${userId}@example.invalid`, threadId = `verify-production-guard:${userId}`;
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const graph = buildLeadWorkflowGraph({} as import("../src/lib/leads/workflow/graph").LeadWorkflowDependencies, saver);
const config = { configurable: { thread_id: threadId } };
let created = false;
try {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Recovery guard fixture','disabled-fixture','member','disabled')", [userId,email]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Recovery guard fixture','Global','WW','Synthetic recovery acceptance')", [workspaceId,userId]);
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Recovery guard fixture')", [conversationId,userId]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','failed',$4)", [actionId,userId,conversationId,JSON.stringify(plan)]);
    await client.query("insert into lead_workflow_job(user_id,action_id,graph_thread_id,status,phase,execution_mode) values($1,$2,$3,'failed','scoring','inline')", [userId,actionId,threadId]);
    await client.query("commit"); created = true;
  } catch(error) { await client.query("rollback"); throw error; } finally { client.release(); }
  await setSpendBudget(userId,100);
  const reservationId = await reservePaidCall(userId,{ operationId:actionId,stage:"synthetic-recovery-guard",tariffKey:"synthetic-recovery-guard",tariffVersion:"fixture-v1",maximumChargeMicros:7,requestBytes:0 });
  // Even if the recovery guard regresses, this task cannot reserve a new provider request.
  await setTaskSpendBudget(userId,actionId,7);
  await graph.updateState(config,{ userId,actionId,workspaceId,graphThreadId:threadId,plan,
    candidates:[candidate],correctedCandidates:[correctedCandidate],assessments:[],
    creditsUsed:13,modelUsage:[],stageMetrics:[],warnings:[],targetCompletionReason:"processing-incomplete",
    processingRecoveryAuthorized:false },"score_candidates");
  const before = await graph.getState(config);
  assert.deepEqual(before.next,["recover_incomplete_processing"]);
  for (const phase of ["reserved","unknown","unknown-repeat"] as const) {
    if (phase === "unknown") await settlePaidCall(userId,reservationId,{ reportedMicros:null,latencyMs:0,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false,outputIncomplete:true });
    const accountingBefore = (await pool.query("select * from paid_call_reservation where id=$1",[reservationId])).rows;
    const queued = await confirmAndQueueLeadWorkflow(userId,actionId,"inline");
    assert.ok(queued); assert.equal(queued.graphThreadId,threadId);
    const claim = await claimLeadWorkflowByAction(userId,actionId,"synthetic-recovery-guard");
    assert.ok(claim);
    await assert.rejects(executeClaimedLeadWorkflow(claim),/paid-request-already-recorded/);
    const after = await graph.getState(config);
    assert.deepEqual(after.values,before.values);
    assert.deepEqual(after.next,before.next);
    assert.equal(after.config.configurable?.checkpoint_id,before.config.configurable?.checkpoint_id);
    assert.deepEqual((await pool.query("select * from paid_call_reservation where id=$1",[reservationId])).rows,accountingBefore);
    const job = (await pool.query("select status,error_message,lease_until from lead_workflow_job where user_id=$1 and action_id=$2",[userId,actionId])).rows[0];
    assert.equal(job.status,"failed"); assert.match(job.error_message,/paid-request-already-recorded/); assert.equal(job.lease_until,null);
    assert.equal((await pool.query("select status from assistant_action where id=$1",[actionId])).rows[0].status,"failed");
  }
  assert.equal((await pool.query("select count(*)::int as n from paid_call_reservation where user_id=$1",[userId])).rows[0].n,1);
  assert.equal(Number((await pool.query("select occupied_micros from user_spend_budget where user_id=$1",[userId])).rows[0].occupied_micros),7);
  assert.equal((await pool.query("select count(*)::int as n from workflow_artifact_event where user_id=$1",[userId])).rows[0].n,0);
  const jobId=(await pool.query("select id from lead_workflow_job where action_id=$1",[actionId])).rows[0].id;
  const claim={jobId,userId,actionId,graphThreadId:threadId,conversationId,plan};
  const result={runId:randomUUID(),countryCode:plan.countryCode,countryName:plan.countryName,requested:plan.targetCount,
    discovered:1,assessed:0,qualified:0,accepted:0,creditsUsed:13,ragCitationCount:0,graphThreadId:threadId,warnings:[]};
  const receipts=async()=> (await pool.query("select id from assistant_message where user_id=$1 and metadata->'searchResult'->>'graphThreadId'=$2",[userId,threadId])).rows;
  await assert.rejects(tenantTransaction(userId,async client=>{await recordWorkflowCompletion(client,claim,result);throw new Error("Synthetic completion commit interruption");}),/Synthetic completion commit interruption/);
  assert.equal((await receipts()).length,0);
  assert.equal((await pool.query("select status from assistant_action where id=$1",[actionId])).rows[0].status,"failed");
  assert.equal((await pool.query("select status from lead_workflow_job where id=$1",[jobId])).rows[0].status,"failed");
  const completions=await Promise.allSettled([completeWorkflowJob(claim,result),completeWorkflowJob(claim,result)]);
  for(const item of completions)if(item.status==="rejected")throw item.reason;
  assert.equal((await receipts()).length,1);
  const receipt=(await pool.query("select metadata from assistant_message where user_id=$1 and metadata->>'completionJobId'=$2",[userId,jobId])).rows[0];
  assert.equal(receipt.metadata.completionObservation.savedOutputItems,1);
  assert.equal(receipt.metadata.completionObservation.downstreamUsedItems,null);
  assert.equal(receipt.metadata.completionObservation.costUsd,0);
  const completed=await pool.query("select status,result,updated_at from lead_workflow_job where id=$1",[jobId]);
  await failWorkflowJob(claim,new Error("Synthetic late failure after committed completion"));
  assert.deepEqual((await pool.query("select status,result,updated_at from lead_workflow_job where id=$1",[jobId])).rows,completed.rows);
  await assert.rejects(completeWorkflowJob(claim,{...result,accepted:1}),/result conflict/);
  for(const invalid of [{...claim,userId:randomUUID()},{...claim,graphThreadId:"wrong-thread"},{...claim,conversationId:randomUUID()}])await assert.rejects(completeWorkflowJob(invalid,result),/mismatch/);
  assert.equal((await receipts()).length,1);
  assert.deepEqual((await pool.query("select status,result from assistant_action where id=$1",[actionId])).rows[0],{status:"completed",result});
  console.log(JSON.stringify({ productionRecoveryGuard:"passed",actualQueueClaimRunnerAttempts:3,checkpointUnchanged:true,syntheticOccupiedMicros:7,providerCalls:0,realMailSent:0 }));
  console.log(JSON.stringify({atomicCompletionRollback:true,concurrentCompletions:2,completionReceipts:1,lateFailurePreservedCompletion:true,conflictingResultRejected:true,ownerThreadConversationIsolation:true,businessResult:"synthetic-only"}));
} finally {
  if (created) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      assert.equal((await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email])).rowCount,1);
      assert.equal((await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-recovery-guard'",[userId])).rowCount,0,"Unexpected paid request: preserve fixture for reconciliation");
      await saver.deleteThread(threadId);
      await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from task_spend_limit where user_id=$1",[userId]);
      await client.query("delete from assistant_conversation where user_id=$1",[userId]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1 and email=$2",[userId,email]);
      await client.query("commit");
      console.log("Synthetic recovery fixture and checkpoint removed.");
    } catch(error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  await pool.end(); await getPool().end();
}
