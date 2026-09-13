import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { candidate, correctedCandidate, plan, playbook } from "./workflow-recovery-fixtures";

nextEnv.loadEnvConfig(process.cwd());
const { getPool } = await import("../src/lib/rag/db");
const { buildLeadWorkflowGraph, runLeadWorkflow } = await import("../src/lib/leads/workflow/graph");
const { setSpendBudget, setTaskSpendBudget, reservePaidCall, settlePaidCall,
  assertUncheckpointedQualificationResponsesAbsent } = await import("../src/lib/billing/repository");
const { companyCostKey } = await import("../src/lib/billing/company-cost-context");
const app = process.env.DATABASE_URL, migration = process.env.DATABASE_MIGRATION_URL;
if (!app || !migration) throw new Error("Both database connections are required");
const a = new URL(app), m = new URL(migration);
if (a.hostname !== m.hostname || (a.port || "5432") !== (m.port || "5432") || a.pathname !== m.pathname)
  throw new Error("Fixture database mismatch");
const ids = process.argv.slice(2);
const [mode, userId = randomUUID(), workspaceId = randomUUID(), conversationId = randomUUID(), actionId = randomUUID()] = ids;
if (mode && !["seed", "reject"].includes(mode)) throw new Error("Invalid fixture phase");
for (const id of [userId, workspaceId, conversationId, actionId]) if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid fixture id");
const threadId = `verify-score-guard:${userId}`, email = `score-guard-${userId}@example.invalid`;
const pool = new Pool({ connectionString: databaseConnectionString(migration), ssl: databaseSslConfiguration(migration) });
const saver = new PostgresSaver(getPool(), undefined, { schema: "langgraph" });
const config = { configurable: { thread_id: threadId } };
try {
  if (!mode) {
    try {
      for (const phase of ["seed", "reject"]) {
        const child = spawnSync(process.execPath,
          ["scripts/run-tsx.cjs", "scripts/verify-uncheckpointed-score-guard.ts", phase,
            userId, workspaceId, conversationId, actionId],
          { encoding: "utf8", windowsHide: true, timeout: 60000, env: process.env });
        if (child.status !== 0) throw new Error(`Score guard ${phase} failed: ${child.stderr}`);
        process.stdout.write(child.stdout);
      }
      console.log(JSON.stringify({ crossProcessGuard: true, secondReservations: 0, realProviderCalls: 0 }));
    } finally {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const fixture = await client.query("select id from app_user where id=$1 and email=$2 for update", [userId,email]);
        if (fixture.rowCount) {
          assert.equal((await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-score-guard'", [userId])).rowCount,0);
          await saver.deleteThread(threadId);
          await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
          await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
          await client.query("delete from task_spend_limit where user_id=$1",[userId]);
          await client.query("delete from lead_workflow_job where user_id=$1",[userId]);
          await client.query("delete from assistant_action where user_id=$1",[userId]);
          await client.query("delete from assistant_conversation where user_id=$1",[userId]);
          await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
          await client.query("delete from spend_budget_change where user_id=$1",[userId]);
          await client.query("delete from user_spend_budget where user_id=$1",[userId]);
          await client.query("delete from app_user where id=$1 and email=$2",[userId,email]);
        }
        await client.query("commit");
      } catch(error) { await client.query("rollback"); throw error; } finally { client.release(); }
    }
  } else if (mode === "seed") {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Score guard fixture','disabled-fixture','member','disabled')",[userId,email]);
      await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Score guard fixture','Global','WW','Synthetic recovery acceptance')",[workspaceId,userId]);
      await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Score guard fixture')",[conversationId,userId]);
      await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','failed',$4)",[actionId,userId,conversationId,JSON.stringify(plan)]);
      await client.query("insert into lead_workflow_job(user_id,action_id,graph_thread_id,status,phase,execution_mode) values($1,$2,$3,'failed','scoring','inline')",[userId,actionId,threadId]);
      await client.query("commit");
    } catch(error) { await client.query("rollback"); throw error; } finally { client.release(); }
    await setSpendBudget(userId,100);
    const graph = buildLeadWorkflowGraph({} as import("../src/lib/leads/workflow/graph").LeadWorkflowDependencies,saver);
    await graph.updateState(config,{userId,actionId,workspaceId,graphThreadId:threadId,
      plan,phase:"routing",runId:randomUUID(),playbook,ragContext:[],candidates:[candidate],
      correctedCandidates:[correctedCandidate],assessments:[],assessmentReviews:[],handoffs:[],
      creditsUsed:0,modelUsage:[],stageMetrics:[],warnings:[]},"route_candidates");
    assert.deepEqual((await graph.getState(config)).next,["score_candidates"]);
    const reservationId=await reservePaidCall(userId,{operationId:actionId,stage:"scoring",tariffKey:"synthetic-score-guard",
      tariffVersion:"fixture-v1",maximumChargeMicros:7,requestBytes:0,
      costAttribution:{version:"company-cost-attribution-v1",kind:"company-inputs",roundKey:null,
        companyKeys:[companyCostKey(candidate.domain,plan.countryCode)]},
      modelAttempt:{invocationId:null,provider:"synthetic",task:"lead-qualification",promptVersion:null,
        attempt:1,requestedModel:"synthetic",gatewayHost:null,endpointKind:"synthetic"}});
    await settlePaidCall(userId,reservationId,{reportedMicros:5,latencyMs:1,responseBytes:10,
      inputTokens:1,outputTokens:1,succeeded:true});
    await setTaskSpendBudget(userId,actionId,7);
    console.log(JSON.stringify({phase:"seed",reportedMicros:5,occupiedMicros:7}));
  } else {
    const graph=buildLeadWorkflowGraph({} as import("../src/lib/leads/workflow/graph").LeadWorkflowDependencies,saver);
    const before=await graph.getState(config);
    assert.ok(before.createdAt);
    await assertUncheckpointedQualificationResponsesAbsent(userId,actionId,before.createdAt,
      [companyCostKey("unrelated.example",plan.countryCode)]);
    await assertUncheckpointedQualificationResponsesAbsent(randomUUID(),actionId,before.createdAt,
      [companyCostKey(candidate.domain,plan.countryCode)]);
    await assert.rejects(runLeadWorkflow({userId,actionId,graphThreadId:threadId,plan}),/paid-request-already-recorded/);
    await assert.rejects(runLeadWorkflow({userId,actionId,graphThreadId:threadId,plan}),/paid-request-already-recorded/);
    const after=await graph.getState(config);
    assert.equal(after.values.scoreRecoveryCheckpointAt,before.createdAt);
    assert.equal((await pool.query("select count(*)::int as n from paid_call_reservation where user_id=$1",[userId])).rows[0].n,1);
    assert.equal(Number((await pool.query("select occupied_micros from user_spend_budget where user_id=$1",[userId])).rows[0].occupied_micros),7);
    assert.equal((await pool.query("select count(*)::int as n from lead_candidate_assessment where user_id=$1",[userId])).rows[0].n,0);
    console.log(JSON.stringify({phase:"reject",checkpointRetained:true,occupiedMicros:7,secondReservations:0}));
  }
} finally {
  await saver.end(); await pool.end();
}
