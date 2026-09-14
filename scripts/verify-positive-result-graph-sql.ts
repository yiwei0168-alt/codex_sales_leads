import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {chromium,expect,type APIResponse} from "@playwright/test";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {companyCostKey,costRoundKey} from "../src/lib/billing/company-cost-context";
import {reservePaidCall,setSpendBudget} from "../src/lib/billing/repository";
import {hashPassword} from "../src/lib/auth/password";
import {hashClientAddress} from "../src/lib/auth/session";
import {processAssistantMessage} from "../src/lib/assistant/service";
import type {LeadSearchPlan} from "../src/lib/assistant/types";
import {leadEvidenceContentHash} from "../src/lib/leads/evidence-snapshot";
import {collectLeadEvidence} from "../src/lib/leads/workflow/discovery";
import {loadCachedLeadAssessments,saveCachedLeadAssessments} from "../src/lib/leads/workflow/assessment-cache";
import {buildLeadWorkflowGraph,type LeadWorkflowDependencies} from "../src/lib/leads/workflow/graph";
import {LeadEvidenceCorrectionAgent} from "../src/lib/leads/workflow/evidence-correction-agent";
import {LeadHandoffAssembler} from "../src/lib/leads/workflow/handoff-assembler";
import {LeadQualificationAgent} from "../src/lib/leads/workflow/qualification-agent";
import {confirmAndQueueLeadWorkflow,claimLeadWorkflowByAction} from "../src/lib/leads/workflow/jobs";
import {completeWorkflowJob} from "../src/lib/leads/workflow/job-completion";
import {persistLeadWorkflowResult,updateWorkflowPhase} from "../src/lib/leads/workflow/persistence";
import {checkpointInvocation,WorkflowPausedError} from "../src/lib/leads/workflow/pause";
import type {DiscoveryResult} from "../src/lib/leads/workflow/discovery";
import type {CorrectedLeadWorkflowCandidate,LeadAssessmentReview} from "../src/lib/leads/workflow/types";
import type {AiProvider,StructuredAiRequest,StructuredAiResponse} from "../src/providers/contracts";
import {DeepSeekProvider} from "../src/providers/deepseek";
import {TavilySearchProvider} from "../src/providers/tavily";
import {ragContext,playbook as fixturePlaybook,candidate as fixtureCandidate,
  correctedCandidate as fixtureCorrected,assessment as fixtureAssessment,plan as fixturePlan} from "./workflow-recovery-fixtures";

nextEnv.loadEnvConfig(process.cwd());
const modes=new Set(process.argv.slice(2));
if(modes.size!==process.argv.length-2||[...modes].some(mode=>!["--pause-resume","--assistant-fallback","--actual-score-agent","--actual-correction-agent","--actual-evidence-collector"].includes(mode)))
  throw new Error("Unknown or repeated verification mode");
const pauseResume=modes.has("--pause-resume"),assistantFallback=modes.has("--assistant-fallback"),
  actualScoreAgent=modes.has("--actual-score-agent"),actualCorrectionAgent=modes.has("--actual-correction-agent"),
  actualEvidenceCollector=modes.has("--actual-evidence-collector");
if(actualCorrectionAgent&&!actualScoreAgent)throw new Error("Current correction requires current scoring in this fixture");
if(actualEvidenceCollector&&!actualCorrectionAgent)throw new Error("Current evidence collection requires current correction in this fixture");
const app=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!app||!migration)throw new Error("Both database connections required");
const appUrl=new URL(app),migrationUrl=new URL(migration);
if(appUrl.hostname!==migrationUrl.hostname||(appUrl.port||"5432")!==(migrationUrl.port||"5432")
  ||appUrl.pathname!==migrationUrl.pathname)throw new Error("Fixture database mismatch");
const admin=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const saver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
const httpBase=process.env.UI_VERIFY_BASE_URL?new URL(process.env.UI_VERIFY_BASE_URL):null;
if(httpBase&&(httpBase.protocol!=="http:"||!["localhost","127.0.0.1"].includes(httpBase.hostname)))
  throw new Error("HTTP fixture requires a local server");
const userId=randomUUID(),otherUserId=randomUUID(),workspaceId=randomUUID(),conversationId=randomUUID();
let actionId:string=randomUUID();
const runId=randomUUID(),domain=`positive-graph-${randomUUID()}.co`;
const password=randomBytes(32).toString("base64url"),fixtureAddress=`positive-graph-${userId}`;
const companyKey=companyCostKey(domain,"CO");
let plan:LeadSearchPlan={...fixturePlan,countryCode:"CO",countryName:"Colombia",targetCount:1,roles:["Distributor"],
  queryLanguage:"es",userRequest:"Synthetic positive-result graph wiring check"};
const evidenceText="Synthetic official company page: Positive Graph Fixture is a Colombian networking distributor. It resells Wi-Fi routers and PoE switches to business resellers and system integrators in Colombia, purchases inventory from manufacturers, and accepts vendor supply proposals.";
const evidenceUrl=`https://${domain}/`;
const evidence={...fixtureCandidate.evidence[0],id:`evidence-${createHash("sha256").update(evidenceUrl).digest("hex").slice(0,16)}`,
  url:evidenceUrl,title:"Positive graph fixture",
  excerpt:evidenceText,capturedAt:new Date().toISOString(),evidenceRunId:runId,
  freshnessStatus:"fresh" as const,contentHash:leadEvidenceContentHash(evidenceText)};
const candidate={...fixtureCandidate,candidateId:`fixture-${randomUUID()}`,companyName:"Positive Graph Fixture",
  domain,officialWebsiteUrl:evidenceUrl,evidenceSnapshotRunId:runId,evidence:actualEvidenceCollector?[]:[evidence]};
const corrected={...candidate,correction:{...fixtureCorrected.correction,
  originalCompanyName:candidate.companyName,originalDomain:domain,originalOfficialWebsiteUrl:candidate.officialWebsiteUrl,
  reliedEvidenceIds:[evidence.id],findings:[...fixtureCorrected.correction.findings,
    {...fixtureCorrected.correction.findings[0],findingId:"finding-identity",kind:"identity" as const,
      statement:"Positive Graph Fixture owns its official Colombian company domain.",roles:[]},
    {...fixtureCorrected.correction.findings[0],findingId:"finding-country",kind:"country-presence" as const,
      statement:"Synthetic fixture operates in Colombia.",roles:[]},
    {...fixtureCorrected.correction.findings[0],findingId:"finding-product",kind:"product-family" as const,
      statement:"Synthetic fixture distributes Wi-Fi routers and PoE switches.",roles:[]},
    {...fixtureCorrected.correction.findings[0],findingId:"finding-procurement",kind:"commercial-action" as const,
      statement:"Synthetic fixture purchases manufacturer inventory and accepts vendor proposals.",roles:[]}]}};
let currentCorrected:CorrectedLeadWorkflowCandidate=corrected;
const assessment={...fixtureAssessment,candidateId:candidate.candidateId,
  evidenceIds:[evidence.id],cooperationPaths:fixtureAssessment.cooperationPaths.map(path=>({...path,
    evidenceIds:[evidence.id]}))};
const wire=new DeepSeekProvider({apiKey:"synthetic-never-sent",maxAttempts:1,
  fetchImplementation:async()=>{throw new Error("External scoring transport is forbidden");}});
const scoreRequests:StructuredAiRequest<unknown>[]=[];
const correctionRequests:StructuredAiRequest<unknown>[]=[];
let supplementalCalls=0;
let syntheticTavilySearches=0,syntheticTavilyExtracts=0;
const originalTavilySearch=TavilySearchProvider.prototype.search;
const originalTavilyExtract=TavilySearchProvider.prototype.extract;
if(actualEvidenceCollector){
  TavilySearchProvider.prototype.search=async input=>{
    syntheticTavilySearches++;
    assert.ok(input.query.includes(`site:${domain}`));
    assert.deepEqual(input.includeDomains,[domain]);
    assert.equal(input.searchDepth,"basic");
    assert.equal(input.includeRawContent,false);
    return {query:input.query,results:[{title:evidence.title,url:evidenceUrl,
      content:evidenceText,score:1}],creditsUsed:0,attempts:1,retries:0,latencyMs:0};
  };
  TavilySearchProvider.prototype.extract=async urls=>{
    syntheticTavilyExtracts++;
    assert.deepEqual(urls,[evidenceUrl]);
    return {results:[{url:evidenceUrl,rawContent:evidenceText}],failedUrls:[],
      creditsUsed:0,attempts:1,retries:0,latencyMs:0};
  };
}
const correctionProvider:AiProvider={
  id:"synthetic-correction-wire",
  requestBytes:request=>wire.requestBytes(request),
  cacheIdentity:request=>wire.cacheIdentity(request),
  execute:async <I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>=>{
    correctionRequests.push(request as StructuredAiRequest<unknown>);
    assert.equal(request.task,"lead-evidence-correction");
    assert.ok(request.evidenceIds.includes(evidence.id));
    assert.ok(wire.requestBytes(request)<=61_440);
    return {output:{corrections:[{candidateId:candidate.candidateId,resolvedCompanyName:candidate.companyName,
      resolvedOfficialWebsiteUrl:candidate.officialWebsiteUrl,roles:["Distributor"],
      primaryBusinessRole:"Distributor",primaryBusinessRoleReason:"Official distributor activity is primary.",
      officialWebsiteEvidenceId:evidence.id,evidenceIds:[evidence.id],findings:[
        {kind:"identity",statement:"The official domain belongs to Positive Graph Fixture.",status:"supported",
          roles:[],evidenceIds:[evidence.id],confidence:95,notes:[]},
        {kind:"country-presence",statement:"The company operates in Colombia.",status:"supported",
          roles:[],evidenceIds:[evidence.id],confidence:90,notes:[]},
        {kind:"active-networking",statement:"The company distributes Wi-Fi routers and PoE switches.",status:"supported",
          roles:[],evidenceIds:[evidence.id],confidence:90,notes:[]},
        {kind:"role",statement:"The company is a networking distributor.",status:"supported",
          roles:["Distributor"],evidenceIds:[evidence.id],confidence:90,notes:[]},
        {kind:"product-family",statement:"The company resells routers and switches.",status:"supported",
          roles:[],evidenceIds:[evidence.id],confidence:85,notes:[]},
        {kind:"commercial-action",statement:"The company purchases inventory and accepts vendor proposals.",status:"supported",
          roles:[],evidenceIds:[evidence.id],confidence:85,notes:[]},
      ],reasons:["Synthetic official evidence supports distribution."],confidence:90,
      escalation:{required:false,expectedTotalScoreChange:0,criticalStateChanges:[],
        higherCapabilityCanResolve:false,reason:""},warnings:[]}] } as O,
      modelVersion:request.modelVersion,promptVersion:request.promptVersion,latencyMs:0,warnings:[]};
  },
};
const correctionAgent=new LeadEvidenceCorrectionAgent(correctionProvider,{
  search:async()=>{supplementalCalls++;throw new Error("Unexpected supplemental search");},
},{allowReusableCorrections:false,persistCorrections:false,batchSize:1,concurrency:1});
const scoreProvider:AiProvider={
  id:"synthetic-score-wire",
  requestBytes:request=>wire.requestBytes(request),
  cacheIdentity:request=>wire.cacheIdentity(request),
  execute:async <I,O>(request:StructuredAiRequest<I>):Promise<StructuredAiResponse<O>>=>{
    scoreRequests.push(request as StructuredAiRequest<unknown>);
    assert.equal(request.task,"lead-qualification");
    assert.ok(request.evidenceIds.includes(evidence.id));
    assert.ok(wire.requestBytes(request)<=61_440);
    const productFinding=currentCorrected.correction.findings.find(finding=>finding.kind==="product-family")?.findingId;
    const roleFinding=currentCorrected.correction.findings.find(finding=>finding.kind==="role")?.findingId;
    assert.ok(productFinding&&roleFinding);
    const modelAssessment={...assessment,
      cooperationPaths:assessment.cooperationPaths.map(path=>({...path,findingIds:[roleFinding]})),
      dimensionRationales:Object.entries(assessment.dimensions).map(([dimension,score])=>({dimension,score,
        reason:"Synthetic current-run company fact supports this dimension.",findingIds:[productFinding],
        evidenceIds:[evidence.id],confidence:85})),
      escalation:{required:false,expectedTotalScoreChange:0,criticalStateChanges:[],
        higherCapabilityCanResolve:false,reason:""}};
    return {output:{assessments:[modelAssessment]} as O,modelVersion:request.modelVersion,
      promptVersion:request.promptVersion,latencyMs:0,warnings:[]};
  },
};
const scoreAgent=new LeadQualificationAgent(scoreProvider,{batchSize:1,concurrency:1});
const review:LeadAssessmentReview={candidateId:candidate.candidateId,required:false,triggers:[],
  status:"not-required",primaryModel:assessment.model,primaryScore:assessment.totalScore,
  finalScore:assessment.totalScore,materialDisagreements:[],rationale:"Synthetic no-review fixture.",warnings:[]};
const callMetric:NonNullable<DiscoveryResult["callMetrics"]>[number]={
  callKey:"distribution/national/0/fixture/fixture",callFingerprint:"positive-graph-fixture",queryClusterKey:"fixture-query",
  route:{category:"distribution",track:"national",sequence:0,provider:"brave",engine:"google",
    mechanism:"synthetic-no-transport",trigger:"core",invocationReason:"Synthetic positive graph wiring"},
  query:"synthetic Colombian distributor",status:"completed",requestedResults:1,rawResults:1,normalizedCompanies:1,
  newUniqueCompanies:1,existingCompanyHits:0,rejectedResults:0,paidSearchCredits:0,requestCount:0,
  groundingQueries:0,inputTokens:0,outputTokens:0,latencyMs:0,retryCount:0,fallbackUsed:false,
  cacheStatus:"miss",discardedReasonCounts:{},items:[]};
const counters={rag:0,playbook:0,discover:0,evidence:0,correct:0,score:0,review:0};
let created=false,threadId:string|undefined,httpViewports=0,pauseScoring=pauseResume;
const startedAt=Date.now();
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of [userId,otherUserId])await client.query(
      "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Positive graph fixture',$3,'member',$4)",
      [id,`positive-graph-${id}@fixture.invalid`,id===userId&&httpBase?hashPassword(password):null,
        id===userId&&httpBase?"active":"disabled"]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Positive graph fixture','Global','WW','Synthetic')",
      [workspaceId,userId]);
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Positive graph fixture')",[conversationId,userId]);
    if(!assistantFallback){
      await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','proposed',$4)",
        [actionId,userId,conversationId,JSON.stringify(plan)]);
      await client.query("insert into assistant_message(user_id,conversation_id,role,intent,content) values($1,$2,'user','general',$3)",
        [userId,conversationId,plan.userRequest]);
    }
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await setSpendBudget(userId,30);
  if(assistantFallback){
    const originalKey=process.env.KIMI_API_KEY;
    delete process.env.KIMI_API_KEY;
    try{
      const first=await processAssistantMessage(userId,{conversationId,content:"搜索哥伦比亚2家分销商"});
      const firstProposed=first.actions.filter(action=>action.status==="proposed");
      assert.equal(firstProposed.length,1);assert.equal(firstProposed[0].payload.targetCount,2);
      const second=await processAssistantMessage(userId,{conversationId,content:"请改为搜索哥伦比亚1家分销商"});
      const proposed=second.actions.filter(action=>action.status==="proposed");
      assert.equal(proposed.length,1);assert.equal(proposed[0].payload.targetCount,1);
      assert.equal(proposed[0].payload.countryCode,"CO");
      assert.deepEqual(proposed[0].payload.roles,["Distributor"]);
      assert.equal(second.actions.find(action=>action.id===firstProposed[0].id)?.status,"cancelled");
      const assistantPlans=second.messages.filter(message=>message.role==="assistant"&&message.intent==="lead-search");
      assert.equal(assistantPlans.length,2);
      assert.ok(assistantPlans.every(message=>message.metadata.planner?.plannerSource==="deterministic-fallback"));
      actionId=proposed[0].id;
      plan={...plan,...proposed[0].payload};
    }finally{
      if(originalKey===undefined)delete process.env.KIMI_API_KEY;
      else process.env.KIMI_API_KEY=originalKey;
    }
  }
  const queued=await confirmAndQueueLeadWorkflow(userId,actionId,"inline");
  assert.ok(queued);threadId=queued.graphThreadId;
  await admin.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,$2,'synthetic-positive-graph',1,'CO',$3,'running')",
    [runId,workspaceId,threadId]);
  const claim=await claimLeadWorkflowByAction(userId,actionId,"positive-graph-fixture");
  assert.ok(claim);
  const reservationId=await reservePaidCall(userId,{operationId:actionId,stage:"synthetic-positive-graph",
    tariffKey:"synthetic-positive-graph",tariffVersion:"fixture",maximumChargeMicros:7,requestBytes:0,
    costAttribution:{version:"company-cost-attribution-v1",kind:"task-shared",companyKeys:[],roundKey:costRoundKey(threadId)}});
  const deps:LeadWorkflowDependencies={
    updatePhase:async(...args)=>{
      if(pauseScoring&&args[2]==="scoring")throw new WorkflowPausedError();
      return updateWorkflowPhase(...args);
    },
    retrieveRagContext:async()=>{counters.rag++;return ragContext;},
    buildPlaybook:async()=>{counters.playbook++;return {...fixturePlaybook,
      marketHypothesis:"Synthetic Colombian positive-result wiring"};},
    discover:async()=>{counters.discover++;return {runId,candidates:[candidate],processedCompanyKeys:[companyKey],
      creditsUsed:0,warnings:[],callMetrics:[callMetric]};},
    collectEvidence:actualEvidenceCollector?async(items,selectedPlan)=>{
      counters.evidence++;
      return collectLeadEvidence(items,selectedPlan,{allowReusableEvidence:false,persistEvidence:false,
        concurrency:1,maximumAttempts:1});
    }:async()=>{counters.evidence++;return {candidates:[candidate],creditsUsed:0,warnings:[]};},
    correctionAgent:actualCorrectionAgent?{correct:async(...args)=>{
      counters.correct++;
      const result=await correctionAgent.correct(...args);
      currentCorrected=result.candidates[0];
      return result;
    }}:{correct:async()=>{counters.correct++;return {candidates:[corrected],creditsUsed:0,warnings:[]};}},
    qualificationAgent:actualScoreAgent?{
      evaluate:async(...args)=>{counters.score++;return scoreAgent.evaluate(...args);},
      evaluateWithUsage:async(...args)=>{counters.score++;return scoreAgent.evaluateWithUsage(...args);},
      cacheContracts:(...args)=>scoreAgent.cacheContracts(...args),
      completedCacheContracts:values=>scoreAgent.completedCacheContracts(values),
    }:{evaluate:async()=>{counters.score++;return [assessment];}},
    loadAssessmentCache:actualScoreAgent?loadCachedLeadAssessments:undefined,
    saveAssessmentCache:actualScoreAgent?saveCachedLeadAssessments:undefined,
    assessmentReviewAgent:{review:async(_candidates,assessments)=>{counters.review++;
      return {assessments,reviews:[{...review,primaryScore:assessments[0].totalScore,
        finalScore:assessments[0].totalScore}],warnings:[]};}},
    handoffAssembler:new LeadHandoffAssembler(),persist:persistLeadWorkflowResult,
  };
  const graph=buildLeadWorkflowGraph(deps,saver);
  const config={configurable:{thread_id:threadId},recursionLimit:50};
  const initial={userId,actionId,workspaceId,graphThreadId:threadId,plan,phase:"queued" as const,
    ragContext:[],candidates:[],correctedCandidates:[],assessments:[],assessmentReviews:[],handoffs:[],
    modelUsage:[],stageMetrics:[],creditsUsed:0,warnings:[],processedCompanyKeys:[]};
  if(pauseResume){
    await assert.rejects(graph.invoke(initial,config),WorkflowPausedError);
    const checkpoint=await graph.getState(config);
    assert.deepEqual(checkpoint.next,["score_candidates"]);
    assert.equal(checkpointInvocation(checkpoint,userId,actionId,plan),"resume");
    assert.throws(()=>checkpointInvocation(checkpoint,otherUserId,actionId),/ownership/);
    assert.throws(()=>checkpointInvocation(checkpoint,userId,randomUUID()),/ownership/);
    assert.equal(checkpoint.values.correctedCandidates[0].candidateId,candidate.candidateId);
    assert.deepEqual(checkpoint.values.correctedCandidates[0].evidence.map((item:{id:string})=>item.id),[evidence.id]);
    assert.equal(checkpoint.values.creditsUsed,0);
    assert.deepEqual(counters,{rag:1,playbook:1,discover:1,evidence:1,correct:1,score:0,review:0});
    assert.equal((await tenantQuery(userId,
      "select candidate_id from workspace_company_market where workspace_id=$1",[workspaceId])).length,0);
    assert.equal((await tenantQuery<{occupied_micros:string}>(userId,
      "select occupied_micros::text from user_spend_budget where user_id=$1",[userId]))[0].occupied_micros,"7");
    pauseScoring=false;
  }
  const state=pauseResume?await graph.invoke(null,config):await graph.invoke(initial,config);
  assert.equal(state.result?.accepted,1);assert.equal(state.result?.targetCompletionReason,"target-met");
  assert.deepEqual(counters,{rag:1,playbook:1,discover:1,evidence:1,correct:1,score:1,review:1});
  assert.equal(scoreRequests.length,actualScoreAgent?1:0);
  assert.equal(correctionRequests.length,actualCorrectionAgent?1:0);
  assert.equal(syntheticTavilySearches,actualEvidenceCollector?1:0);
  assert.equal(syntheticTavilyExtracts,actualEvidenceCollector?1:0);
  if(actualEvidenceCollector){
    assert.equal(state.candidates[0].evidence.length,1);
    assert.equal(state.candidates[0].evidence[0].provider,"tavily");
    assert.equal(state.candidates[0].evidence[0].contentHash,leadEvidenceContentHash(evidenceText));
    assert.equal(state.candidates[0].evidence[0].evidenceRunId,runId);
  }
  assert.equal(supplementalCalls,0);
  assert.equal(state.correctedCandidates[0].correction.primaryRole,"Distributor");
  if(actualCorrectionAgent){
    const checked=state.correctedCandidates[0];
    assert.equal(checked.correction.completionStatus,"completed");
    assert.equal(checked.correction.primaryFamily,"distribution");
    assert.deepEqual(checked.correction.resolvedRoles,["Distributor"]);
    assert.deepEqual(checked.correction.reliedEvidenceIds,[evidence.id]);
    assert.equal(checked.correction.findings.filter(finding=>finding.status==="supported").length,6);
    assert.equal(checked.domain,domain);
    assert.equal(correctionRequests[0].dataClassification,"public");
  }
  if(actualScoreAgent){
    const scored=state.assessments[0];
    assert.equal(scored.scoringStatus,"completed");assert.equal(scored.eligibilityStatus,"eligible");
    assert.deepEqual(Object.values(scored.gates),Array(5).fill("supported"));
    assert.equal(scored.companyScaleClass,"Unknown");
    assert.equal(scored.dimensions.scaleAndChannelCoverage,8);
    assert.ok(scored.totalScore<=fixtureAssessment.totalScore);
    assert.deepEqual(scored.evidenceIds,[evidence.id]);
    assert.equal(scored.dimensionRationales.length,7);
    assert.equal(scoreRequests[0].dataClassification,"public");
  }
  assert.equal(state.handoffs.length,1);
  await completeWorkflowJob(claim,state.result!);
  await completeWorkflowJob(claim,state.result!);
  const run=await tenantQuery<{status:string;accepted_count:number}>(userId,
    "select status,accepted_count from lead_search_run where id=$1",[runId]);
  assert.equal(run[0]?.status,"completed");assert.equal(run[0]?.accepted_count,1);
  const companies=await tenantQuery<{candidate_id:string;country_code:string;domain:string}>(userId,
    `select market.candidate_id,market.country_code,company.domain
       from workspace_company_market market join sales_company company on company.id=market.company_id
      where market.workspace_id=$1`,[workspaceId]);
  assert.equal(companies.length,1);
  assert.equal(companies[0].country_code,"CO");assert.equal(companies[0].domain,domain);
  assert.match(companies[0].candidate_id,/^market-co-[a-f0-9]{24}$/);
  assert.equal((await tenantQuery(otherUserId,
    "select candidate_id from workspace_company_market where workspace_id=$1",[workspaceId])).length,0);
  const assessmentRows=await tenantQuery<{candidate_id:string;scoring_status:string}>(userId,
    "select candidate_id,scoring_status from lead_candidate_assessment where run_id=$1",[runId]);
  assert.deepEqual(assessmentRows,[{candidate_id:candidate.candidateId,scoring_status:"completed"}]);
  if(actualScoreAgent){
    const cached=await tenantQuery<{candidate_id:string}>(userId,
      "select candidate_id from lead_assessment_cache where workspace_id=$1",[workspaceId]);
    assert.deepEqual(cached,[{candidate_id:candidate.candidateId}]);
  }
  const receipts=await tenantQuery<{content:string}>(userId,
    "select content from assistant_message where user_id=$1 and metadata->>'completionJobId'=$2",[userId,claim.jobId]);
  assert.equal(receipts.length,1);
  const budget=await tenantQuery<{occupied_micros:string}>(userId,
    "select occupied_micros::text from user_spend_budget where user_id=$1",[userId]);
  assert.equal(budget[0].occupied_micros,"7");
  const allocation=await tenantQuery<{metrics:Record<string,unknown>}>(userId,
    "select metrics from paid_call_reservation where id=$1",[reservationId]);
  const allocated=allocation[0].metrics.completedReservationAllocation as {shares:Array<{companyKey:string;amountMicros:number}>;unallocatedMicros:number};
  assert.deepEqual(allocated.shares,[{companyKey,amountMicros:7}]);assert.equal(allocated.unallocatedMicros,0);
  if(httpBase){
    const browser=await chromium.launch({channel:"chrome",headless:true});
    try{
      for(const width of [1366,390]){
        const context=await browser.newContext({viewport:{width,height:width===1366?900:844}});
        try{
          const login:APIResponse=await context.request.post(new URL("/api/auth/login",httpBase).href,
            {data:{email:`positive-graph-${userId}@fixture.invalid`,password},
              headers:{"x-forwarded-for":fixtureAddress}});
          assert.equal(login.status(),200,`Fixture login failed at ${width}px`);
          const task:APIResponse=await context.request.get(new URL(`/api/tasks/${actionId}?kind=search`,httpBase).href);
          assert.equal(task.status(),200);
          const detail=await task.json() as {action:{status:string;result:{accepted:number;targetCompletionReason:string}}};
          assert.equal(detail.action.status,"completed");assert.equal(detail.action.result.accepted,1);
          assert.equal(detail.action.result.targetCompletionReason,"target-met");
          await context.route("**/*",route=>{
            const request=route.request(),url=new URL(request.url());
            return url.origin===httpBase.origin&&["GET","HEAD"].includes(request.method())?route.continue():route.abort();
          });
          const page=await context.newPage();
          await page.goto(new URL(`/tasks/${actionId}?kind=search`,httpBase).href);
          await expect(page.locator("main")).toContainText("目标已满足");
          await expect(page.locator("main")).toContainText("最终保存");
          await page.reload();
          await expect(page.locator("main")).toContainText("目标已满足");
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          httpViewports++;
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
  console.log(JSON.stringify({positiveGraphSql:"passed",pauseResume,assistantFallback,actualScoreAgent,
    actualCorrectionAgent,actualEvidenceCollector,syntheticTavilySearches,syntheticTavilyExtracts,
    syntheticCorrectionRequests:correctionRequests.length,
    syntheticScoringRequests:scoreRequests.length,target:1,accepted:1,stopReason:"target-met",counters,
    handoffs:state.handoffs.length,companyRows:companies.length,assessmentRows:assessmentRows.length,
    completionReceipts:receipts.length,httpViewports,syntheticReservedMicros:7,allocatedMicros:7,actualPaidCalls:0,
    latencyMs:Date.now()-startedAt}));
}finally{
  TavilySearchProvider.prototype.search=originalTavilySearch;
  TavilySearchProvider.prototype.extract=originalTavilyExtract;
  if(created){
    const client=await admin.connect();
    try{
      await client.query("begin");
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Positive graph fixture' for update",
        [[userId,otherUserId]]);
      if(owners.rowCount!==2)throw new Error("Fixture identity mismatch");
      const unexpected=await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-positive-graph'",[userId]);
      if(unexpected.rowCount)throw new Error("Unexpected paid activity; preserve fixture");
      if(threadId)await saver.deleteThread(threadId);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from assistant_conversation where user_id=$1",[userId]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      if(httpBase)await client.query("delete from auth_login_attempt where ip_sha256=$1",[hashClientAddress(fixtureAddress)]);
      await client.query("delete from app_user where id=any($1::uuid[])",[[userId,otherUserId]]);
      await client.query("delete from sales_company where domain=$1",[domain]);
      await client.query("commit");
      assert.equal((await admin.query("select id from sales_company where domain=$1",[domain])).rowCount,0);
      console.log("Synthetic positive graph fixture removed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
