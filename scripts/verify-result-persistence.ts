import nextEnv from "@next/env";
import {randomUUID,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,adminUrl=process.env.DATABASE_MIGRATION_URL;
if(!app||!adminUrl)throw new Error("Both database connections required");
const a=new URL(app),b=new URL(adminUrl);
if(a.hostname!==b.hostname||(a.port||'5432')!==(b.port||'5432')||a.pathname!==b.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(adminUrl),ssl:databaseSslConfiguration(adminUrl)});
const {getPool,tenantQuery,tenantTransaction}=await import("../src/lib/rag/db");
const {persistLeadWorkflowResult,saveCompany}=await import("../src/lib/leads/workflow/persistence");
const {updateCompanyState}=await import("../src/lib/sales/repository");
const {materializeCompanyMarket}=await import("../src/lib/sales/company-market-state");
const {persistenceInputFingerprint,RESULT_PERSISTENCE_IDENTITY_VERSION}=await import("../src/lib/leads/workflow/persistence-identity");
const {completedStageMetric}=await import("../src/lib/leads/workflow/workflow-telemetry");
const {setSpendBudget,reservePaidCall}=await import("../src/lib/billing/repository");
const {companyCostKey,costRoundKey}=await import("../src/lib/billing/company-cost-context");
const {correctedCandidate,assessment,playbook}=await import("./workflow-recovery-fixtures");
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID();
const domain=`persistence-${randomUUID()}.fixture.invalid`;
const countries=["CO","MX"];
const runs=countries.map(()=>randomUUID()),actions=countries.map(()=>randomUUID()),threads=countries.map(()=>`persistence:${randomUUID()}`);
const emptyRunId=randomUUID(),emptyActionId=randomUUID(),emptyThreadId=`persistence:${randomUUID()}`;
const reviewFailedRunId=randomUUID(),reviewFailedActionId=randomUUID(),reviewFailedThreadId=`persistence:${randomUUID()}`;
const reviewFailedDomain=`review-failed-${randomUUID()}.fixture.invalid`;
let created=false;
try{
  const client=await admin.connect();
  try{
    await client.query('begin');
    for(const id of [userId,otherUserId])await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Persistence fixture','member','disabled')",[id,`persistence-${id}@fixture.invalid`]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Persistence fixture','Global','WW','Synthetic')",[workspaceId,userId]);
    const conversation=await client.query<{id:string}>("insert into assistant_conversation(user_id,title) values($1,'Persistence fixture') returning id",[userId]);
    for(let i=0;i<countries.length;i++){
      await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running',$4)",
        [actions[i],userId,conversation.rows[0].id,JSON.stringify({countryCode:countries[i],targetCount:1})]);
      await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'fixture',1,$3,$4,'running')",[runs[i],workspaceId,countries[i],threads[i]]);
      const call=await client.query<{id:string}>(`insert into lead_search_provider_call(run_id,provider,engine,mechanism,search_category,search_track,trigger_kind,invocation_reason,status)
        values($1,'fixture','fixture','fixture','distribution','fixture','fixture','Synthetic persistence validation','completed') returning id`,[runs[i]]);
      await client.query(`insert into lead_search_provider_occurrence(occurrence_key,run_id,provider_call_id,candidate_key,domain,rank,source_kind,normalized)
        values($1,$2,$3,$4,$5,1,'fixture',true)`,[randomUUID(),runs[i],call.rows[0].id,`domain:${domain}`,domain]);
    }
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running',$4)",
      [emptyActionId,userId,conversation.rows[0].id,JSON.stringify({countryCode:"CL",targetCount:1})]);
    await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'fixture',1,'CL',$3,'running')",
      [emptyRunId,workspaceId,emptyThreadId]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','running',$4)",
      [reviewFailedActionId,userId,conversation.rows[0].id,JSON.stringify({countryCode:"PE",targetCount:1})]);
    await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'fixture',1,'PE',$3,'running')",
      [reviewFailedRunId,workspaceId,reviewFailedThreadId]);
    await client.query('commit');created=true;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  await setSpendBudget(userId,1000);
  for(let i=0;i<countries.length;i++){
    const countryCode=countries[i],runId=runs[i],actionId=actions[i],graphThreadId=threads[i];
    const companyKey=companyCostKey(domain,countryCode);
    const reservationId=await reservePaidCall(userId,{operationId:actionId,stage:"fixture",tariffKey:"synthetic",tariffVersion:"fixture",
      maximumChargeMicros:11+i,requestBytes:0,costAttribution:{version:"company-cost-attribution-v1",kind:"task-shared",companyKeys:[],roundKey:costRoundKey(graphThreadId)}});
    const source={...correctedCandidate,candidateId:`fixture-${i}`,companyName:"Persistence Fixture",domain,officialWebsiteUrl:`https://${domain}/`,evidenceSnapshotRunId:runId,
      evidence:[{...correctedCandidate.evidence[0],url:`https://${domain}/`,capturedAt:"2026-09-13T00:00:00Z",freshnessStatus:"fresh" as const,evidenceRunId:runId,
        contentHash:createHash('sha256').update('Synthetic networking evidence').digest('hex'),excerpt:"Synthetic networking evidence"}]};
    const input={userId,workspaceId,actionId,graphThreadId,runId,countryCode,countryName:countryCode,requested:1,creditsUsed:0,ragContext:[],playbook,
      candidates:[source],assessments:[{...assessment,candidateId:source.candidateId}],assessmentReviews:[{
        candidateId:source.candidateId,required:false,triggers:[],status:"not-required" as const,
        primaryModel:assessment.model,primaryScore:assessment.totalScore,finalScore:assessment.totalScore,
        materialDisagreements:[],rationale:"No deterministic review trigger fired.",warnings:[],
      }],handoffs:[],modelUsage:[],
      stageMetrics:[completedStageMetric({stage:"persist_results",startedAt:Date.now(),input:[],output:{expectedResult:true}})],warnings:[],processedCompanyKeys:[companyKey]};
    const outcomes=await Promise.allSettled([persistLeadWorkflowResult(input),persistLeadWorkflowResult(input)]);
    const results=outcomes.map(outcome=>{if(outcome.status==='rejected')throw outcome.reason;return outcome.value;});
    for(const result of results){assert.equal(result.accepted,1);assert.deepEqual(result.deliveryCounts,{added:1,updated:0,roleChanged:0});}
    const retried={...input,stageMetrics:input.stageMetrics.map(metric=>({...metric,startedAt:"2026-09-14T00:00:00Z",completedAt:"2026-09-14T00:00:01Z"}))};
    assert.deepEqual(await persistLeadWorkflowResult(retried),results[0]);
    await assert.rejects(persistLeadWorkflowResult({...input,requested:0}),/conflicts with this persistence input/);
    await assert.rejects(persistLeadWorkflowResult({...input,countryCode:"GB"}),/conflicts with this persistence input/);
    await assert.rejects(persistLeadWorkflowResult({...input,assessments:[{...input.assessments[0],totalScore:1}]}),/conflicts with this persistence input/);
    const fingerprint=await admin.query("select metadata->>'persistenceInputFingerprint' as value from lead_search_run where id=$1",[runId]);
    // Existing unversioned identities keep their exact original contract; never silently rewrite history.
    await admin.query("update lead_search_run set metadata=(metadata-'persistenceInputIdentityVersion') || jsonb_build_object('persistenceInputFingerprint',$2::text) where id=$1",[runId,persistenceInputFingerprint(input)]);
    assert.deepEqual(await persistLeadWorkflowResult(input),results[0]);
    await assert.rejects(persistLeadWorkflowResult(retried),/conflicts with this persistence input/);
    await admin.query("update lead_search_run set metadata=metadata || jsonb_build_object('persistenceInputFingerprint',$2::text,'persistenceInputIdentityVersion',$3::text) where id=$1",[runId,fingerprint.rows[0].value,RESULT_PERSISTENCE_IDENTITY_VERSION]);
    await admin.query("update lead_search_run set metadata=metadata-'persistenceInputFingerprint' where id=$1",[runId]);
    await assert.rejects(persistLeadWorkflowResult(input),/no replay identity/);
    await admin.query("update lead_search_run set metadata=jsonb_set(metadata,'{persistenceInputFingerprint}',to_jsonb($2::text)) where id=$1",[runId,fingerprint.rows[0].value]);
    assert.deepEqual(await persistLeadWorkflowResult(input),results[0]);
    const events=await tenantQuery<{event_type:string;artifact_count:number;metadata:Record<string,unknown>}>(userId,
      'select event_type,artifact_count,metadata from workflow_artifact_event where lead_run_id=$1',[runId]);
    assert.equal(events.length,7);
    for(const event of events){assert.equal(event.metadata.countryCode,countryCode);assert.equal(event.metadata.userAdoptedItems,null);assert.equal(event.metadata.uiViewedItems,null);}
    const occurrence=await admin.query("select displayed,selected,metadata from lead_search_provider_occurrence where run_id=$1",[runId]);
    assert.equal(occurrence.rows[0].displayed,null);assert.equal(occurrence.rows[0].selected,true);
    assert.equal(occurrence.rows[0].metadata.selectionActor,'system');
    const snapshots=await tenantQuery<{count:string;expiry_correct:boolean}>(userId,
      "select count(*)::text as count,bool_and(expires_at=retrieved_at+freshness_days*interval '1 day') as expiry_correct from lead_evidence_snapshot where run_id=$1",[runId]);
    assert.equal(snapshots[0].count,'1');
    assert.equal(snapshots[0].expiry_correct,true);
    const cost=await tenantQuery<{reserved_micros:string;settled_micros:string|null;metrics:Record<string,unknown>}>(userId,
      'select reserved_micros::text,settled_micros::text,metrics from paid_call_reservation where id=$1',[reservationId]);
    assert.equal(cost[0].reserved_micros,String(11+i));assert.equal(cost[0].settled_micros,null);
    assert.deepEqual((cost[0].metrics.costAllocationCompletion as {processedCompanyKeys:string[]}).processedCompanyKeys,[companyKey]);
    const allocation=cost[0].metrics.completedReservationAllocation as {shares:unknown[];unallocatedMicros:number;sourceAmountMicros:number};
    assert.deepEqual(allocation.shares,[{companyKey,amountMicros:11+i}]);
    assert.equal(allocation.unallocatedMicros,0);assert.equal(allocation.sourceAmountMicros,11+i);
    assert.equal((await tenantQuery(otherUserId,'select id from workflow_artifact_event where lead_run_id=$1',[runId])).length,0);
  }
  const reviewFailedSource={...correctedCandidate,candidateId:"review-failed-candidate",companyName:"Review failed fixture",
    domain:reviewFailedDomain,officialWebsiteUrl:`https://${reviewFailedDomain}/`,evidenceSnapshotRunId:reviewFailedRunId,
    evidence:[{...correctedCandidate.evidence[0],url:`https://${reviewFailedDomain}/`,capturedAt:"2026-09-15T00:00:00Z",
      freshnessStatus:"fresh" as const,evidenceRunId:reviewFailedRunId,
      contentHash:createHash("sha256").update("Synthetic review-failed evidence").digest("hex"),
      excerpt:"Synthetic review-failed evidence"}]};
  const reviewFailedAssessment={...assessment,candidateId:reviewFailedSource.candidateId};
  const reviewFailedInput={userId,workspaceId,actionId:reviewFailedActionId,graphThreadId:reviewFailedThreadId,
    runId:reviewFailedRunId,countryCode:"PE",countryName:"Peru",requested:1,creditsUsed:0,ragContext:[],playbook,
    candidates:[reviewFailedSource],assessments:[reviewFailedAssessment],assessmentReviews:[{
      candidateId:reviewFailedSource.candidateId,required:true,triggers:["score-near-threshold"],
      status:"review-failed" as const,primaryModel:assessment.model,primaryScore:assessment.totalScore,
      finalScore:assessment.totalScore,materialDisagreements:[],rationale:"Synthetic reviewer failure.",
      warnings:["Synthetic reviewer returned no valid output."],
    }],handoffs:[],modelUsage:[],stageMetrics:[completedStageMetric({stage:"persist_results",startedAt:Date.now(),
      input:[reviewFailedAssessment],output:{expectedResult:false}})],warnings:[],processedCompanyKeys:[]};
  const reviewFailedResult=await persistLeadWorkflowResult(reviewFailedInput);
  assert.equal(reviewFailedResult.accepted,0);assert.equal(reviewFailedResult.qualified,0);
  const reviewFailedRows=await tenantQuery<{selected:boolean;assessment_review:{status:string}}>(userId,
    "select selected,assessment_review from lead_candidate_assessment where run_id=$1",[reviewFailedRunId]);
  assert.deepEqual(reviewFailedRows,[{selected:false,assessment_review:{
    candidateId:reviewFailedSource.candidateId,required:true,triggers:["score-near-threshold"],status:"review-failed",
    primaryModel:assessment.model,primaryScore:assessment.totalScore,finalScore:assessment.totalScore,
    materialDisagreements:[],rationale:"Synthetic reviewer failure.",warnings:["Synthetic reviewer returned no valid output."]}}]);
  assert.equal((await tenantQuery(userId,
    "select market.candidate_id from workspace_company_market market join sales_company company on company.id=market.company_id where market.workspace_id=$1 and company.domain=$2",
    [workspaceId,reviewFailedDomain])).length,0);
  const emptyReservationId=await reservePaidCall(userId,{operationId:emptyActionId,stage:"fixture",tariffKey:"synthetic",tariffVersion:"fixture",
    maximumChargeMicros:5,requestBytes:0,costAttribution:{version:"company-cost-attribution-v1",kind:"task-shared",companyKeys:[],roundKey:costRoundKey(emptyThreadId)}});
  const emptyInput={userId,workspaceId,actionId:emptyActionId,graphThreadId:emptyThreadId,runId:emptyRunId,countryCode:"CL",countryName:"CL",
    requested:1,creditsUsed:0,ragContext:[],playbook,candidates:[],assessments:[],assessmentReviews:[],handoffs:[],modelUsage:[],
    stageMetrics:[completedStageMetric({stage:"persist_results",startedAt:Date.now(),input:[],output:{expectedResult:false}})],
    warnings:[],processedCompanyKeys:[]};
  const emptyOutcomes=await Promise.allSettled([persistLeadWorkflowResult(emptyInput),persistLeadWorkflowResult(emptyInput)]);
  const emptyResults=emptyOutcomes.map(outcome=>{if(outcome.status==="rejected")throw outcome.reason;return outcome.value;});
  assert.deepEqual(emptyResults[0],emptyResults[1]);
  assert.equal(emptyResults[0].accepted,0);assert.equal(emptyResults[0].qualified,0);
  assert.deepEqual(emptyResults[0].deliveryCounts,{added:0,updated:0,roleChanged:0});
  const emptyRun=await tenantQuery<{status:string;accepted_count:number;metadata:Record<string,unknown>}>(userId,
    "select status,accepted_count,metadata from lead_search_run where id=$1",[emptyRunId]);
  assert.equal(emptyRun[0].status,"completed");assert.equal(emptyRun[0].accepted_count,0);
  assert.deepEqual((emptyRun[0].metadata.costAllocationCompletion as {processedCompanyKeys:string[]}).processedCompanyKeys,[]);
  assert.equal((await tenantQuery(userId,"select id from lead_candidate_assessment where run_id=$1",[emptyRunId])).length,0);
  assert.equal((await tenantQuery(userId,"select id from lead_search_result where run_id=$1",[emptyRunId])).length,0);
  const emptyCost=await tenantQuery<{reserved_micros:string;settled_micros:string|null;metrics:Record<string,unknown>}>(userId,
    "select reserved_micros::text,settled_micros::text,metrics from paid_call_reservation where id=$1",[emptyReservationId]);
  assert.equal(emptyCost[0].reserved_micros,"5");assert.equal(emptyCost[0].settled_micros,null);
  assert.deepEqual(emptyCost[0].metrics.completedReservationAllocation,{version:"company-cost-allocation-v1",basis:"reservation",
    sourceAmountMicros:5,roundKey:costRoundKey(emptyThreadId),method:"zero-company-task",shares:[],unallocatedMicros:5,
    amountKnown:true,additionalSpendMicros:0});
  assert.equal((await tenantQuery(otherUserId,"select id from workflow_artifact_event where lead_run_id=$1",[emptyRunId])).length,0);
  const rows=await tenantQuery<{country_code:string;company_id:string;record:Record<string,unknown>;revision:string}>(userId,
    'select country_code,company_id,record,revision::text from workspace_company_market where workspace_id=$1 order by country_code',[workspaceId]);
  assert.deepEqual(rows.map(row=>row.country_code),countries);
  assert.equal(new Set(rows.map(row=>row.company_id)).size,1);
  for(const row of rows){assert.equal(row.record.country,row.country_code);assert.equal(row.record.opportunityStage,'Discovered');assert.equal(row.revision,'1');}
  const countryBefore=await tenantQuery<{candidate_id:string;record:import("../src/lib/domain").CompanyRecord}>(userId,
    "select candidate_id,record from workspace_company_market where workspace_id=$1 and country_code='CO'",[workspaceId]);
  assert.equal(countryBefore.length,1);
  const edited=await updateCompanyState(countryBefore[0].candidate_id,{primaryBusinessRole:"SI",accountTier:"KA",
    opportunityStage:"Contacted",nextAction:"Synthetic user follow-up"},userId);
  assert.equal(edited.primaryBusinessRole,"SI");assert.equal(edited.accountTier,"KA");
  const reassessmentRunId=randomUUID();
  await admin.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'fixture',1,'CO',$3,'running')",
    [reassessmentRunId,workspaceId,`reassessment:${randomUUID()}`]);
  const reassessment={...countryBefore[0].record,fitScore:84,primaryBusinessRole:"Distributor" as const,
    accountTier:"Priority Distributor" as const,opportunityStage:"Discovered" as const,
    nextAction:"Synthetic new agent action",searchRunId:reassessmentRunId};
  const merge=await tenantTransaction(userId,client=>saveCompany(client,workspaceId,reassessment,"CO",reassessmentRunId));
  assert.deepEqual(merge,{added:0,updated:1,roleChanged:0});
  const after=await tenantQuery<import("../src/lib/sales/company-market-state").CompanyMarketRow>(userId,
    "select * from workspace_company_market where workspace_id=$1 order by country_code",[workspaceId]);
  const co=after.find(row=>row.country_code==="CO")!,mx=after.find(row=>row.country_code==="MX")!;
  assert.equal(co.record.fitScore,84);assert.equal(co.search_run_id,reassessmentRunId);
  assert.equal(co.record.assessmentNeedsRefresh,true);
  assert.equal(co.user_overrides.primaryBusinessRole,"SI");assert.equal(co.user_overrides.accountTier,"KA");
  assert.equal(co.user_overrides.opportunityStage,"Contacted");
  const visible=materializeCompanyMarket(co);
  assert.equal(visible.primaryBusinessRole,"SI");assert.equal(visible.accountTier,"KA");
  assert.equal(visible.opportunityStage,"Contacted");assert.equal(visible.nextAction,"Synthetic user follow-up");
  assert.equal(visible.fitScore,84);assert.equal(visible.assessmentNeedsRefresh,true);
  assert.equal(mx.record.fitScore,79);assert.equal(materializeCompanyMarket(mx).primaryBusinessRole,"Distributor");
  assert.equal(mx.revision,"1");
  assert.equal((await tenantQuery(otherUserId,"select candidate_id from workspace_company_market where workspace_id=$1",[workspaceId])).length,0);
  const memory=await tenantQuery<{id:string}>(userId,"select id from user_outreach_memory where workspace_id=$1 and external_id=$2",
    [workspaceId,`company-override:${co.candidate_id}`]);
  assert.equal(memory.length,1);
  const budget=await admin.query('select occupied_micros::text from user_spend_budget where user_id=$1',[userId]);
  assert.equal(budget.rows[0].occupied_micros,'28');
  assert.equal((await tenantQuery(otherUserId,'select company_id from workspace_company_market where workspace_id=$1',[workspaceId])).length,0);
  console.log(JSON.stringify({actualProductPersistence:true,countries:2,sharedCompanyIdentities:1,concurrentCalls:4,artifactEvents:14,
    evidenceSnapshots:2,countryRecords:2,conflictingReplaysRejected:6,persistenceTimingReplays:2,legacyExactReplays:2,legacyTimingConflictsPreserved:2,legacyReplaysPreserved:2,
    userEditReassessment:{roleAndTierPreserved:true,agentScoreUpdated:true,refreshRequired:true,otherCountryUnchanged:true,privateMemory:1},
    zeroQualifiedRun:{accepted:0,companyRowsAdded:0,unallocatedMicros:5,concurrentReplays:2},
    reviewFailedGate:{accepted:0,qualified:0,assessmentRows:1,companyRowsAdded:0},
    unknownAdoption:true,syntheticReservedMicros:28,realProviderCalls:0,scope:"synthetic-input-to-real-product-SQL"}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query('begin');
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Persistence fixture' and email='persistence-'||id::text||'@fixture.invalid' for update",[[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      const unexpected=await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic'",[userId]);
      if(unexpected.rowCount)throw new Error("Unexpected paid activity; preserve fixture");
      await client.query('delete from market_workspace where id=$1 and owner_id=$2',[workspaceId,userId]);
      await client.query('delete from paid_call_reservation where user_id=$1',[userId]);
      await client.query('delete from spend_budget_change where user_id=$1',[userId]);
      await client.query('delete from user_spend_budget where user_id=$1',[userId]);
      await client.query('delete from app_user where id=any($1::uuid[])',[[userId,otherUserId]]);
      await client.query('delete from sales_company where domain=$1',[domain]);
      await client.query('commit');console.log('Synthetic persistence fixture removed.');
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
