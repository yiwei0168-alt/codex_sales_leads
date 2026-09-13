import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {plan,playbook,correctedCandidate} from "./workflow-recovery-fixtures";
nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!app||!migration)throw new Error("Both database connections required");
const a=new URL(app),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool}=await import("../src/lib/rag/db");
const {buildLeadWorkflowGraph}=await import("../src/lib/leads/workflow/graph");
const {persistLeadWorkflowResult}=await import("../src/lib/leads/workflow/persistence");
const {readSavedProcessingRecovery}=await import("../src/lib/assistant/processing-recovery");
const {setSpendBudget,reservePaidCall}=await import("../src/lib/billing/repository");
const user=randomUUID(),workspace=randomUUID(),conversation=randomUUID(),action=randomUUID(),run=randomUUID();
const thread=`saved-recovery-source:${user}`,email=`saved-recovery-${user}@example.invalid`;
const domain=`saved-recovery-${user}.fixture.invalid`;
const candidate={...correctedCandidate,domain,companyName:"Saved recovery fixture",officialWebsiteUrl:`https://${domain}/`,evidence:[]};
const saver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
const graph=buildLeadWorkflowGraph({} as import("../src/lib/leads/workflow/graph").LeadWorkflowDependencies,saver);
const config={configurable:{thread_id:thread}};
let created=false;
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Saved recovery fixture','disabled-fixture','member','disabled')",[user,email]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Saved recovery fixture','Global','WW','Synthetic')",[workspace,user]);
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Saved recovery fixture')",[conversation,user]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running',$4)",[action,user,conversation,JSON.stringify(plan)]);
    await client.query("insert into lead_workflow_job(user_id,action_id,graph_thread_id,status,phase,execution_mode) values($1,$2,$3,'running','persisting','inline')",[user,action,thread]);
    await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status,metadata) values($1,$2,'synthetic-saved-source',$3,$4,$5,'running',$6)",[run,workspace,plan.targetCount,plan.countryCode,thread,JSON.stringify({assistantActionId:action,graphThreadId:thread})]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await setSpendBudget(user,100);
  const input={userId:user,workspaceId:workspace,actionId:action,runId:run,graphThreadId:thread,countryCode:plan.countryCode,countryName:plan.countryName,
    requested:plan.targetCount,creditsUsed:0,ragContext:[],playbook,candidates:[candidate],assessments:[],assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],warnings:[],targetCompletionReason:"processing-incomplete" as const};
  // The graph adds completion status after persistence; mirror that actual boundary.
  const result={...await persistLeadWorkflowResult(input),targetCompletionReason:input.targetCompletionReason};
  await graph.updateState(config,{...input,plan,phase:"completed",candidates:[candidate],correctedCandidates:[candidate],result},"persist_results");
  await admin.query("update assistant_action set status='completed',result=$2 where id=$1",[action,JSON.stringify(result)]);
  await admin.query("update lead_workflow_job set status='completed',result=$2 where action_id=$1",[action,JSON.stringify(result)]);
  const before=(await graph.getState(config));
  const first=await readSavedProcessingRecovery(user,action),repeat=await readSavedProcessingRecovery(user,action);
  assert.deepEqual(first,repeat);assert.equal(first.scope.companies.length,1);assert.equal(first.scope.discoveryAllowed,false);
  assert.equal(first.proof.checkpointId,before.config.configurable?.checkpoint_id);
  assert.deepEqual((await graph.getState(config)).values,before.values);
  await assert.rejects(readSavedProcessingRecovery(randomUUID(),action));
  await admin.query("update assistant_action set result=jsonb_set(result,'{creditsUsed}','1') where id=$1",[action]);
  await assert.rejects(readSavedProcessingRecovery(user,action),/mismatch/);
  await admin.query("update assistant_action set result=$2 where id=$1",[action,JSON.stringify(result)]);
  await admin.query("update lead_search_run set country_code='MX' where id=$1",[run]);
  await assert.rejects(readSavedProcessingRecovery(user,action),/verified persisted source/);
  await admin.query("update lead_search_run set country_code=$2 where id=$1",[run,plan.countryCode]);
  await reservePaidCall(user,{operationId:action,maximumChargeMicros:1,stage:"synthetic-saved-source",tariffKey:"synthetic-saved-source",tariffVersion:"fixture",requestBytes:0});
  await assert.rejects(readSavedProcessingRecovery(user,action),/paid-request-already-recorded/);
  assert.equal((await admin.query("select count(*)::int as n from assistant_action where user_id=$1",[user])).rows[0].n,1);
  console.log(JSON.stringify({actualPersistenceAndCheckpoint:true,repeatedReadStable:true,sourceResultMismatchRejected:true,countryMismatchRejected:true,ownerIsolation:true,unknownCostBlocked:true,newActions:0,providerCalls:0,syntheticMicros:1}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      assert.equal((await client.query("select id from app_user where id=$1 and email=$2 for update",[user,email])).rowCount,1);
      assert.equal((await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-saved-source'",[user])).rowCount,0,"Unexpected paid request: preserve fixture");
      await saver.deleteThread(thread);
      for(const table of ["paid_cost_observation","paid_call_reservation","task_spend_limit","assistant_conversation","spend_budget_change","user_spend_budget"])await client.query(`delete from ${table} where user_id=$1`,[user]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspace,user]);
      await client.query("delete from app_user where id=$1 and email=$2",[user,email]);
      await client.query("commit");console.log("Synthetic saved-source fixture and checkpoint removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
