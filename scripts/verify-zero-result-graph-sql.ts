import nextEnv from "@next/env";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {chromium,expect,type APIResponse} from "@playwright/test";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {ragContext,playbook,plan as fixturePlan} from "./workflow-recovery-fixtures";
import type {LeadWorkflowDependencies} from "../src/lib/leads/workflow/graph";
import type {DiscoveryResult} from "../src/lib/leads/workflow/discovery";

nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!app||!migration)throw new Error("Both database connections required");
const a=new URL(app),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Fixture database mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const {getPool,tenantQuery}=await import("../src/lib/rag/db");
const {buildLeadWorkflowGraph}=await import("../src/lib/leads/workflow/graph");
const {persistLeadWorkflowResult,updateWorkflowPhase}=await import("../src/lib/leads/workflow/persistence");
const {persistHybridSearchCall}=await import("../src/lib/leads/workflow/discovery");
const {withSpendContext}=await import("../src/lib/billing/context");
const {confirmAndQueueLeadWorkflow,claimLeadWorkflowByAction}=await import("../src/lib/leads/workflow/jobs");
const {completeWorkflowJob}=await import("../src/lib/leads/workflow/job-completion");
const {setSpendBudget,reservePaidCall}=await import("../src/lib/billing/repository");
const {costRoundKey}=await import("../src/lib/billing/company-cost-context");
const {hashPassword}=await import("../src/lib/auth/password");
const {hashClientAddress}=await import("../src/lib/auth/session");
const startedAt=Date.now();
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),conversationId=randomUUID(),actionId=randomUUID(),runId=randomUUID();
const email=`zero-graph-${userId}@fixture.invalid`,otherEmail=`zero-graph-${otherUserId}@fixture.invalid`;
const password=randomBytes(32).toString("base64url"),fixtureAddress=`zero-graph-${userId}`;
const httpBase=process.env.UI_VERIFY_BASE_URL?new URL(process.env.UI_VERIFY_BASE_URL):null;
if(httpBase&&(httpBase.protocol!=="http:"||!["localhost","127.0.0.1"].includes(httpBase.hostname)))
  throw new Error("HTTP fixture requires a local server");
const plan={...fixturePlan,countryCode:"CO",countryName:"Colombia",targetCount:1,userRequest:"Synthetic zero-result wiring check"};
const threadId=`zero-graph:${randomUUID()}`;
const saver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
let created=false,discoveryCalls=0,providerCalls=0,httpViewports=0,activeThreadId=threadId;
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Zero graph fixture',$3,'member',$4)",
      [userId,email,httpBase?hashPassword(password):null,httpBase?"active":"disabled"]);
    await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Zero graph fixture','member','disabled')",[otherUserId,otherEmail]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Zero graph fixture','Global','WW','Synthetic graph SQL check')",[workspaceId,userId]);
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Zero graph fixture')",[conversationId,userId]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','proposed',$4)",
      [actionId,userId,conversationId,JSON.stringify(plan)]);
    await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'synthetic-zero-graph',1,'CO',$3,'running')",
      [runId,workspaceId,threadId]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await setSpendBudget(userId,100);
  const queued=await confirmAndQueueLeadWorkflow(userId,actionId,"inline");
  assert.ok(queued);
  activeThreadId=queued.graphThreadId;
  // The real queue creates a thread ID; bind the isolated result run to that ID.
  await admin.query("update lead_search_run set graph_thread_id=$2 where id=$1",[runId,queued.graphThreadId]);
  const claim=await claimLeadWorkflowByAction(userId,actionId,"zero-graph-fixture");
  assert.ok(claim);assert.equal(claim.graphThreadId,queued.graphThreadId);
  const reservationId=await reservePaidCall(userId,{operationId:actionId,stage:"synthetic-zero-graph",tariffKey:"synthetic-zero-graph",tariffVersion:"fixture",
    maximumChargeMicros:5,requestBytes:0,costAttribution:{version:"company-cost-attribution-v1",kind:"task-shared",companyKeys:[],roundKey:costRoundKey(claim.graphThreadId)}});
  const failedCall:NonNullable<DiscoveryResult["callMetrics"]>[number]={
    callKey:"distribution/national/0/fixture/fixture",callFingerprint:"synthetic-unavailable",queryClusterKey:"synthetic-query",
    route:{category:"distribution",track:"national",sequence:0,provider:"gemini-full",engine:"google-grounded",
      mechanism:"planning-and-semantic-web-search",trigger:"core",invocationReason:"Synthetic unavailable call; no transport"},
    query:"synthetic fixture",status:"failed",requestedResults:1,rawResults:0,normalizedCompanies:0,newUniqueCompanies:0,
    existingCompanyHits:0,rejectedResults:0,paidSearchCredits:0,requestCount:0,groundingQueries:0,inputTokens:0,outputTokens:0,
    latencyMs:0,retryCount:0,fallbackUsed:false,cacheStatus:"miss",discardedReasonCounts:{},items:[]};
  const dependencies:LeadWorkflowDependencies={
    updatePhase:updateWorkflowPhase,
    retrieveRagContext:async()=>ragContext,
    buildPlaybook:async()=>({...playbook,marketHypothesis:"Synthetic Colombia zero-result wiring check"}),
    discover:async()=>{discoveryCalls++;return {runId,candidates:[],processedCompanyKeys:[],creditsUsed:0,warnings:[],callMetrics:[failedCall]};},
    collectEvidence:async()=>({candidates:[],creditsUsed:0,warnings:[]}),
    correctionAgent:{correct:async()=>({candidates:[],creditsUsed:0,warnings:[]})},
    qualificationAgent:{evaluate:async()=>{providerCalls++;throw new Error("No candidate may be scored");}},
    assessmentReviewAgent:{review:async()=>({assessments:[],reviews:[],warnings:[]})},
    handoffAssembler:{assemble:()=>[]},persist:persistLeadWorkflowResult,
  };
  const graph=buildLeadWorkflowGraph(dependencies,saver);
  const state=await graph.invoke({userId,actionId,workspaceId,graphThreadId:claim.graphThreadId,plan,phase:"queued",ragContext:[],
    candidates:[],correctedCandidates:[],assessments:[],assessmentReviews:[],handoffs:[],modelUsage:[],stageMetrics:[],
    creditsUsed:0,warnings:[],processedCompanyKeys:[]},{configurable:{thread_id:claim.graphThreadId},recursionLimit:50});
  assert.equal(discoveryCalls,1);assert.equal(providerCalls,0);
  assert.equal(state.targetCompletionReason,"provider-unavailable");
  assert.equal(state.result?.targetCompletionReason,"provider-unavailable");
  assert.equal(state.result?.accepted,0);assert.equal(state.result?.requested,1);
  await completeWorkflowJob(claim,state.result!);
  await completeWorkflowJob(claim,state.result!);
  const run=await tenantQuery<{status:string;accepted_count:number;metadata:Record<string,unknown>}>(userId,
    "select status,accepted_count,metadata from lead_search_run where id=$1",[runId]);
  assert.equal(run[0].status,"completed");assert.equal(run[0].accepted_count,0);
  assert.deepEqual((run[0].metadata.costAllocationCompletion as {processedCompanyKeys:string[]}).processedCompanyKeys,[]);
  const outcome=await tenantQuery<{job_status:string;action_status:string;job_result:Record<string,unknown>;action_result:Record<string,unknown>}>(userId,
    `select j.status as job_status,a.status as action_status,j.result as job_result,a.result as action_result
      from lead_workflow_job j join assistant_action a on a.id=j.action_id where j.id=$1`,[claim.jobId]);
  assert.equal(outcome[0].job_status,"completed");assert.equal(outcome[0].action_status,"completed");
  assert.equal(outcome[0].job_result.targetCompletionReason,"provider-unavailable");
  assert.deepEqual(outcome[0].job_result,outcome[0].action_result);
  const receipts=await tenantQuery<{content:string;metadata:Record<string,unknown>}>(userId,
    "select content,metadata from assistant_message where user_id=$1 and metadata->>'completionJobId'=$2",[userId,claim.jobId]);
  assert.equal(receipts.length,1);assert.match(receipts[0].content,/部分完成/);assert.match(receipts[0].content,/缺口 1 家/);
  assert.match(receipts[0].content,/搜索服务不可用/);
  assert.equal((receipts[0].metadata.searchResult as Record<string,unknown>).targetCompletionReason,"provider-unavailable");
  const cost=await tenantQuery<{reserved_micros:string;settled_micros:string|null;metrics:Record<string,unknown>}>(userId,
    "select reserved_micros::text,settled_micros::text,metrics from paid_call_reservation where id=$1",[reservationId]);
  assert.equal(cost[0].reserved_micros,"5");assert.equal(cost[0].settled_micros,null);
  assert.deepEqual(cost[0].metrics.completedReservationAllocation,{version:"company-cost-allocation-v1",basis:"reservation",
    sourceAmountMicros:5,roundKey:costRoundKey(claim.graphThreadId),method:"zero-company-task",shares:[],unallocatedMicros:5,
    amountKnown:true,additionalSpendMicros:0});
  assert.equal((await tenantQuery(userId,"select candidate_id from workspace_company_market where workspace_id=$1",[workspaceId])).length,0);
  await withSpendContext({userId,operationId:actionId,stage:"synthetic-telemetry"},
    ()=>persistHybridSearchCall(runId,plan,failedCall));
  const persistedCall=await tenantQuery<{id:string;query_id:string}>(userId,
    "select id,query_id from lead_search_provider_call where run_id=$1 and call_fingerprint='synthetic-unavailable'",[runId]);
  assert.equal(persistedCall.length,1);
  assert.equal((await tenantQuery(otherUserId,"select id from lead_search_provider_call where id=$1",[persistedCall[0].id])).length,0);
  // Exercise the four dependent search tables with the application role.
  const searchQueryId=(await tenantQuery<{id:string}>(userId,
    "insert into lead_search_query(run_id,query_text,role_hint,lead_type,language) values($1,'fixture only','SI','channel','es') returning id",[runId]))[0].id;
  const resultId=(await tenantQuery<{id:string}>(userId,
    "insert into lead_search_result(run_id,query_id,url,domain,title) values($1,$2,$3,'fixture.invalid','Fixture') returning id",
    [runId,searchQueryId,`https://fixture.invalid/${randomUUID()}`]))[0].id;
  const providerCallId=(await tenantQuery<{id:string}>(userId,
    `insert into lead_search_provider_call(run_id,query_id,provider,engine,mechanism,search_category,search_track,
       trigger_kind,invocation_reason,status) values($1,$2,'fixture','fixture','fixture','distribution','national',
       'core','RLS fixture','skipped') returning id`,[runId,searchQueryId]))[0].id;
  const occurrenceId=(await tenantQuery<{id:string}>(userId,
    `insert into lead_search_provider_occurrence(occurrence_key,run_id,provider_call_id,rank,source_kind)
       values($1,$2,$3,1,'fixture') returning id`,[`zero-graph:${randomUUID()}`,runId,providerCallId]))[0].id;
  assert.equal((await tenantQuery(otherUserId,"select id from assistant_message where conversation_id=$1",[conversationId])).length,0);
  assert.equal((await tenantQuery(otherUserId,"select id from lead_search_run where id=$1",[runId])).length,0);
  for(const [table,id] of [["lead_search_query",searchQueryId],["lead_search_result",resultId],
    ["lead_search_provider_call",providerCallId],["lead_search_provider_occurrence",occurrenceId]]){
    assert.equal((await tenantQuery(otherUserId,`select id from ${table} where id=$1`,[id])).length,0,`${table} leaked`);
    assert.equal((await tenantQuery(otherUserId,`update ${table} set id=id where id=$1 returning id`,[id])).length,0,
      `${table} accepted a foreign update`);
  }
  await assert.rejects(tenantQuery(otherUserId,
    "insert into lead_search_query(run_id,query_text,role_hint,lead_type,language) values($1,'foreign fixture','SI','channel','es')",
    [runId]),/row-level security|permission denied/i);
  const occupied=await admin.query<{occupied_micros:string}>("select occupied_micros::text from user_spend_budget where user_id=$1",[userId]);
  assert.equal(occupied.rows[0].occupied_micros,"5");
  if(httpBase){
    const browser=await chromium.launch({channel:"chrome",headless:true});
    try{
      for(const width of [1366,390]){
        const context=await browser.newContext({viewport:{width,height:width===1366?900:844}});
        try{
          const login:APIResponse=await context.request.post(new URL("/api/auth/login",httpBase).href,
            {data:{email,password},headers:{"x-forwarded-for":fixtureAddress}});
          assert.equal(login.status(),200,`Fixture login failed at ${width}px`);
          const task:APIResponse=await context.request.get(new URL(`/api/tasks/${actionId}?kind=search`,httpBase).href);
          assert.equal(task.status(),200);
          const detail=await task.json() as {action:{status:string;result:{accepted:number;targetCompletionReason:string}}};
          assert.equal(detail.action.status,"completed");
          assert.equal(detail.action.result.accepted,0);
          assert.equal(detail.action.result.targetCompletionReason,"provider-unavailable");
          await context.route("**/*",route=>{
            const request=route.request(),url=new URL(request.url());
            return url.origin===httpBase.origin&&["GET","HEAD"].includes(request.method())?route.continue():route.abort();
          });
          const page=await context.newPage();
          await page.goto(new URL(`/tasks/${actionId}?kind=search`,httpBase).href);
          await expect(page.locator("main")).toContainText("运行结束，目标未填满");
          await expect(page.locator("main")).toContainText("缺口 1 家；搜索服务不可用");
          await page.reload();
          await expect(page.locator("main")).toContainText("缺口 1 家；搜索服务不可用");
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          httpViewports++;
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
  console.log(JSON.stringify({graphSqlCompletion:"passed",target:1,accepted:0,stopReason:"provider-unavailable",discoveryCalls,
    providerCalls,completionReceipts:receipts.length,isolatedSearchTables:5,httpViewports,
    syntheticReservedMicros:5,unallocatedMicros:5,actualPaidCalls:0,latencyMs:Date.now()-startedAt}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Zero graph fixture' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      const unexpected=await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-zero-graph'",[userId]);
      if(unexpected.rowCount)throw new Error("Unexpected paid activity; preserve fixture");
      await saver.deleteThread(activeThreadId);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from assistant_conversation where user_id=$1",[userId]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      if(httpBase)await client.query("delete from auth_login_attempt where ip_sha256=$1",[hashClientAddress(fixtureAddress)]);
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("commit");console.log("Synthetic graph SQL fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
