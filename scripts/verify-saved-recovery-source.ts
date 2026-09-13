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
const {getPool,tenantTransaction}=await import("../src/lib/rag/db");
const {buildLeadWorkflowGraph,readSavedWorkflowRecoveryCheckpoint,runLeadWorkflow}=await import("../src/lib/leads/workflow/graph");
const {persistLeadWorkflowResult}=await import("../src/lib/leads/workflow/persistence");
const {readSavedProcessingRecovery,proposeProcessingRecovery,proposeProcessingRecoveryInTransaction,prepareProcessingRecoveryExecution}=await import("../src/lib/assistant/processing-recovery");
const {confirmAndQueueLeadWorkflow,claimLeadWorkflowByAction}=await import("../src/lib/leads/workflow/jobs");
const {setSpendBudget,setTaskSpendBudget,reservePaidCall}=await import("../src/lib/billing/repository");
const user=randomUUID(),workspace=randomUUID(),conversation=randomUUID(),action=randomUUID(),run=randomUUID();
const thread=`saved-recovery-source:${user}`,email=`saved-recovery-${user}@example.invalid`;
const domain=`saved-recovery-${user}.fixture.invalid`;
const candidate={...correctedCandidate,domain,companyName:"Saved recovery fixture",officialWebsiteUrl:`https://${domain}/`,evidence:[]};
const saver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
const graph=buildLeadWorkflowGraph({} as import("../src/lib/leads/workflow/graph").LeadWorkflowDependencies,saver);
const config={configurable:{thread_id:thread}};
let created=false;
let recoveryThread:string|null=null;
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
  assert.deepEqual(first.evidenceReadiness,[{candidateId:candidate.candidateId,reusableEvidence:0,needsEvidenceRefresh:true,reasons:{"missing-scoring-evidence":1}}]);
  assert.equal(first.proof.checkpointId,before.config.configurable?.checkpoint_id);
  assert.deepEqual((await graph.getState(config)).values,before.values);
  await assert.rejects(tenantTransaction(user,async client=>{
    await proposeProcessingRecoveryInTransaction(client,user,action,readSavedWorkflowRecoveryCheckpoint);
    throw new Error("Synthetic proposal transaction interruption");
  }),/Synthetic proposal transaction interruption/);
  assert.equal((await admin.query("select count(*)::int as n from assistant_action where user_id=$1",[user])).rows[0].n,1);
  assert.equal((await admin.query("select count(*)::int as n from lead_processing_recovery where user_id=$1",[user])).rows[0].n,0);
  const proposals=await Promise.all([proposeProcessingRecovery(user,action),proposeProcessingRecovery(user,action)]);
  assert.equal(proposals[0].actionId,proposals[1].actionId);
  assert.deepEqual(proposals.map(p=>p.reused).sort(),[false,true]);
  const childId=proposals[0].actionId;
  assert.equal((await admin.query("select count(*)::int as n from assistant_message where user_id=$1 and metadata->>'processingRecoveryActionId'=$2",[user,childId])).rows[0].n,1);
  const observations=(await admin.query("select changes->'efficiency' as e from workspace_audit_event where actor_user_id=$1 and entity_type='processing-recovery'",[user])).rows;
  assert.equal(observations.reduce((sum,row)=>sum+row.e.savedOutputItems,0),1);
  assert.ok(observations.every(row=>row.e.userAdoptedItems===null&&row.e.downstreamUsedItems===0));
  await assert.rejects(runLeadWorkflow({userId:user,actionId:childId,graphThreadId:`forbidden:${childId}`,plan:proposals[0].gap===plan.targetCount?plan:{...plan,targetCount:proposals[0].gap}}),/confirmed task/);
  const recoveryPlan={...plan,targetCount:proposals[0].gap};
  await assert.rejects(prepareProcessingRecoveryExecution(user,childId,"unconfirmed",recoveryPlan),/confirmed task/);
  await confirmAndQueueLeadWorkflow(user,childId,"inline");
  const recoveryClaim=await claimLeadWorkflowByAction(user,childId,"synthetic-saved-source");assert.ok(recoveryClaim);
  recoveryThread=recoveryClaim.graphThreadId;
  await assert.rejects(prepareProcessingRecoveryExecution(user,childId,"wrong-thread",recoveryPlan),/confirmed task/);
  await assert.rejects(prepareProcessingRecoveryExecution(user,childId,recoveryClaim.graphThreadId,{...recoveryPlan,countryCode:"MX"}),/plan mismatch/);
  const initialized=await Promise.all([prepareProcessingRecoveryExecution(user,childId,recoveryClaim.graphThreadId,recoveryPlan),prepareProcessingRecoveryExecution(user,childId,recoveryClaim.graphThreadId,recoveryPlan)]);
  assert.ok(initialized[0]);assert.ok(initialized[1]);assert.equal(initialized[0].runId,initialized[1].runId);assert.notEqual(initialized[0].runId,run);
  assert.equal((await admin.query("select count(*)::int as n from lead_search_run where workspace_id=$1",[workspace])).rows[0].n,2);
  assert.equal((await admin.query("select status from lead_search_run where id=$1",[run])).rows[0].status,"completed");
  await setTaskSpendBudget(user,childId,0);
  // Missing fixture knowledge or zero budget must stop actual wiring before any paid operation.
  await assert.rejects(runLeadWorkflow({userId:user,actionId:childId,graphThreadId:recoveryClaim.graphThreadId,plan:recoveryPlan}));
  const seeded=await graph.getState({configurable:{thread_id:recoveryClaim.graphThreadId}});
  assert.equal(seeded.values.runId,initialized[0].runId);
  assert.equal(seeded.values.savedProcessingRecovery?.sourceActionId,action);
  assert.equal(seeded.values.terminalRecoveryOnly,true);
  assert.equal((await admin.query("select count(*)::int as n from paid_call_reservation where user_id=$1 and operation_id=$2",[user,childId])).rows[0].n,0);
  await assert.rejects(readSavedProcessingRecovery(randomUUID(),action));
  await admin.query("update assistant_action set result=jsonb_set(result,'{creditsUsed}','1') where id=$1",[action]);
  await assert.rejects(readSavedProcessingRecovery(user,action),/mismatch/);
  await admin.query("update assistant_action set result=$2 where id=$1",[action,JSON.stringify(result)]);
  await admin.query("update lead_search_run set country_code='MX' where id=$1",[run]);
  await assert.rejects(readSavedProcessingRecovery(user,action),/verified persisted source/);
  await admin.query("update lead_search_run set country_code=$2 where id=$1",[run,plan.countryCode]);
  await graph.updateState(config,{warnings:["Synthetic source revision"]},"persist_results");
  await assert.rejects(proposeProcessingRecovery(user,action),/source changed after proposal/);
  await assert.rejects(prepareProcessingRecoveryExecution(user,childId,recoveryClaim.graphThreadId,recoveryPlan),/source changed before execution/);
  await reservePaidCall(user,{operationId:action,maximumChargeMicros:1,stage:"synthetic-saved-source",tariffKey:"synthetic-saved-source",tariffVersion:"fixture",requestBytes:0});
  await assert.rejects(readSavedProcessingRecovery(user,action),/paid-request-already-recorded/);
  assert.equal((await admin.query("select count(*)::int as n from assistant_action where user_id=$1",[user])).rows[0].n,2);
  console.log(JSON.stringify({actualPersistenceAndCheckpoint:true,repeatedReadStable:true,sourceResultMismatchRejected:true,countryMismatchRejected:true,ownerIsolation:true,unknownCostBlocked:true,newActions:1,proposalRollback:true,concurrentProposalReuse:true,savedObservation:1,ordinaryDiscoveryBlocked:true,providerCalls:0,syntheticMicros:1}));
  console.log(JSON.stringify({confirmedClaimRequired:true,threadAndPlanVerified:true,concurrentInitializationOneNewRun:true,originalRunPreserved:true,changedSourceExecutionBlocked:true}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      assert.equal((await client.query("select id from app_user where id=$1 and email=$2 for update",[user,email])).rowCount,1);
      assert.equal((await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-saved-source'",[user])).rowCount,0,"Unexpected paid request: preserve fixture");
      await saver.deleteThread(thread);
      if(recoveryThread)await saver.deleteThread(recoveryThread);
      for(const table of ["paid_cost_observation","paid_call_reservation","task_spend_limit","assistant_conversation","spend_budget_change","user_spend_budget"])await client.query(`delete from ${table} where user_id=$1`,[user]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspace,user]);
      await client.query("delete from app_user where id=$1 and email=$2",[user,email]);
      await client.query("commit");console.log("Synthetic saved-source fixture and checkpoint removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await admin.end();await getPool().end();
}
