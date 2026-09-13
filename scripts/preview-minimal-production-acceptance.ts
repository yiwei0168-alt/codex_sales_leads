import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const {query,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const {quoteRequest,BudgetDeniedError,billingPolicy}=await import("../src/lib/billing/policy");
const {assertRequestContract}=await import("../src/lib/billing/request-contract");
const {nativeModelBound}=await import("../src/lib/billing/native-model-bound");
const {embeddingModelBound}=await import("../src/lib/billing/embedding-model-bound");
const {getRagConfig}=await import("../src/lib/rag/config");
const {resolveOpenRouterModel}=await import("../src/providers/openrouter");
const {deepSeekRequestBody}=await import("../src/providers/deepseek-request");
const {textOutputLimit}=await import("../src/lib/billing/text-output-policy");
const {plannedCandidatePool}=await import("../src/lib/leads/workflow/target-completion-policy");
const {buildHybridSearchRoute}=await import("../src/lib/leads/workflow/hybrid-search-policy");
const {readSearchRateStatuses}=await import("../src/lib/billing/search-rate-repository");
const userId="cbee9803-3c43-4609-9228-66086b207012";
const minimalPlan={countryCode:"CO",countryName:"Colombia",objective:"new-market" as const,
  roles:["Distributor" as const],targetCount:1,queryLanguage:"es",userRequest:"Synthetic acceptance wire only"};
async function captureMinimalPlaybookWire(){
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.OPENROUTER_API_KEY;
  const captured:Request[]=[];
  globalThis.fetch=async(input,init)=>{
    captured.push(new Request(input,init));
    throw new BudgetDeniedError("missing-tariff");
  };
  process.env.OPENROUTER_API_KEY="synthetic-never-sent";
  try{
    const {buildLeadMarketPlaybook}=await import("../src/lib/leads/workflow/playbook");
    const {ragContext}=await import("./workflow-recovery-fixtures");
    try{await buildLeadMarketPlaybook(minimalPlan,ragContext);}
    catch(error){if(!(error instanceof BudgetDeniedError)||error.code!=="missing-tariff")throw error;}
    if(captured.length!==1)throw new Error("Unexpected market-playbook transport count");
    const request=captured[0],url=new URL(request.url),wire=await request.text(),body=JSON.parse(wire);
    const bytes=Buffer.byteLength(wire,"utf8");
    const quote={origin:url.origin,pathname:url.pathname,model:body.model,
      requestBytes:bytes,outputTokens:body.max_completion_tokens};
    try{
      const rule=quoteRequest(quote);
      assertRequestContract(rule,body,url.search,request.method,request.headers);
      return {status:"contract-valid-synthetic-wire",model:body.model,requestBytes:bytes,
        outputTokens:body.max_completion_tokens,tariffKey:rule.key,maximumPerCallUsd:rule.maximumChargeMicros/1e6,
        actualMarketContextChecked:false,providerCalls:0};
    }catch(error){
      if(!(error instanceof BudgetDeniedError))throw error;
      return {status:error.code,model:body.model,requestBytes:bytes,
        outputTokens:body.max_completion_tokens,actualMarketContextChecked:false,providerCalls:0};
    }
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY=originalKey;
  }
}
async function captureMinimalBraveWire(){
  const originalKey=process.env.BRAVE_SEARCH_API_KEY;
  const captured:Request[]=[];
  process.env.BRAVE_SEARCH_API_KEY="synthetic-never-sent";
  try{
    const {createDiscoveryProvider}=await import("../src/providers/discovery");
    const {buildStandardLeadMarketPlaybook}=await import("../src/lib/leads/workflow/playbook");
    const {ragContext}=await import("./workflow-recovery-fixtures");
    const route=buildHybridSearchRoute(minimalPlan).find(step=>step.provider==="brave"&&step.trigger==="core");
    if(!route)throw new Error("Minimal plan has no Brave core route");
    const playbook=buildStandardLeadMarketPlaybook(minimalPlan,ragContext);
    const provider=createDiscoveryProvider("brave",{maxAttempts:1,fetchImplementation:async(input,init)=>{
      captured.push(new Request(input,init));
      throw new BudgetDeniedError("missing-tariff");
    }});
    try{await provider.search({query:playbook.searchQueries[0].query,countryCode:minimalPlan.countryCode,
      countryName:minimalPlan.countryName,languageCode:minimalPlan.queryLanguage,maxResults:2,
      category:route.category,track:route.track,engine:route.engine,mechanism:route.mechanism});}
    catch(error){if(!(error instanceof BudgetDeniedError)||error.code!=="missing-tariff")throw error;}
    if(captured.length!==1)throw new Error("Unexpected Brave core transport count");
    const request=captured[0],url=new URL(request.url);
    const quote={origin:url.origin,pathname:url.pathname,model:"",requestBytes:Buffer.byteLength(url.search,"utf8"),
      outputTokens:null};
    try{
      const rule=quoteRequest(quote);
      assertRequestContract(rule,{},url.search,request.method,request.headers);
      return {status:"contract-valid-synthetic-wire",provider:"brave",category:route.category,
        track:route.track,requestMethod:request.method,queryBytes:quote.requestBytes,
        countryParameter:url.searchParams.get("country"),resultLimit:url.searchParams.get("count"),
        tariffKey:rule.key,maximumPerCallUsd:rule.maximumChargeMicros/1e6,
        actualMarketQueryChecked:false,providerCalls:0};
    }catch(error){
      if(!(error instanceof BudgetDeniedError))throw error;
      return {status:error.code,provider:"brave",category:route.category,track:route.track,
        queryBytes:quote.requestBytes,actualMarketQueryChecked:false,providerCalls:0};
    }
  }finally{
    if(originalKey===undefined)delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY=originalKey;
  }
}
try{
  const identity=await query<{safe:boolean}>("select (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe from app_user where id=$1",[userId]);
  if(identity[0]?.safe!==true)throw new Error("Acceptance identity differs; no execution allowed");
  const budget=await readSpendBudget(userId);
  if(!budget.budget||String(budget.budget.limit_micros)!=="30000000")throw new Error("Acceptance ceiling differs");
  const rag=getRagConfig();
  const probes:Array<{stage:string;url:string;model:string;outputTokens:number|null;requestBytes:number;
    conditional?:boolean}>=[];
  const kimiBase=process.env.KIMI_BASE_URL?.trim()||"https://api.moonshot.cn/v1";
  for(const [stage,model] of [["intent-light",process.env.KIMI_INTENT_LIGHT_MODEL?.trim()||"kimi-k2.6"],
    ["intent-complex-conditional",process.env.KIMI_INTENT_MODEL?.trim()||process.env.KIMI_MODEL?.trim()||"kimi-k3"]]){
    probes.push({stage,url:`${kimiBase.replace(/\/$/,"")}/chat/completions`,model,outputTokens:4000,requestBytes:0,
      conditional:stage==="intent-complex-conditional"});
  }
  probes.push({stage:"knowledge-embedding",url:`${rag.embeddingBaseUrl.replace(/\/$/,"")}/embeddings`,model:rag.embeddingModel,outputTokens:null,requestBytes:0});
  probes.push({stage:"market-playbook",url:`${rag.openaiBaseUrl}/chat/completions`,
    model:resolveOpenRouterModel(process.env.LEAD_PLANNER_MODEL?.trim()||process.env.OPENAI_GENERATION_MODEL?.trim()||"gpt-5-mini","openai"),
    outputTokens:textOutputLimit("lead-playbook"),requestBytes:0});
  const model=process.env.DEEPSEEK_MODEL?.trim()||"deepseek-v4-flash";
  const escalationModel=process.env.DEEPSEEK_ESCALATION_MODEL?.trim()||"deepseek-v4-pro";
  for(const [stage,task,requestedModel,conditional] of [
    ["role-correction","lead-evidence-correction",model,false],
    ["primary-role-score","lead-qualification",model,false],
    ...(escalationModel===model?[]:[["role-correction-escalation","lead-evidence-correction",escalationModel,true],
      ["score-escalation","lead-qualification",escalationModel,true]])
  ] as Array<[string,string,string,boolean]>){
    const wire=deepSeekRequestBody({task:task as "lead-evidence-correction"|"lead-qualification",
      modelVersion:requestedModel,promptVersion:"preflight-only",input:{},evidenceIds:[]});
    probes.push({stage,url:`${(process.env.DEEPSEEK_BASE_URL?.trim()||"https://api.deepseek.com").replace(/\/$/,"")}${wire.useAnthropicTransport?"/anthropic/v1/messages":"/chat/completions"}`,
      model:requestedModel,outputTokens:JSON.parse(wire.body).max_tokens,requestBytes:Buffer.byteLength(wire.body),conditional});
  }
  for(const [stage,task,configuredModel] of [["secondary-review","compatible-review",
    process.env.LEAD_REVIEW_MODEL?.trim()||"gpt-5.6-terra"],
    ["disagreement-judge","compatible-judge",process.env.LEAD_JUDGE_MODEL?.trim()||"gpt-5.6-sol"]] as const){
    probes.push({stage,url:`${rag.openaiBaseUrl}/chat/completions`,
      model:resolveOpenRouterModel(configuredModel,"openai"),outputTokens:textOutputLimit(task),
      requestBytes:0,conditional:true});
  }
  const stages=[];
  for(const probe of probes){
    const url=new URL(probe.url);
    if(url.username||url.password||url.search)throw new Error("Unexpected endpoint credentials or query");
    try{
      const input={origin:url.origin,pathname:url.pathname,model:probe.model,requestBytes:probe.requestBytes,outputTokens:probe.outputTokens};
      const bound=(await nativeModelBound(input)??await embeddingModelBound(input))?.rule??quoteRequest(input);
      stages.push({stage:probe.stage,model:probe.model,conditional:Boolean(probe.conditional),tariff:"available",maximumPerCallUsd:bound.maximumChargeMicros/1e6,
        fitsCurrentRemainingBudget:bound.maximumChargeMicros<=Number(budget.budget.remaining_micros),expiresAt:bound.expiresAt});
    }catch(error){
      if(!(error instanceof BudgetDeniedError))throw error;
      stages.push({stage:probe.stage,model:probe.model,conditional:Boolean(probe.conditional),tariff:error.code});
    }
  }
  const sourceStatus:Map<string,{status:string;hold:boolean|null}>=new Map(
    (await readSearchRateStatuses()).map(item=>[item.tariffKey,item]));
  const searchSourceByProvider=new Map<string,string>([["brave","brave-standard-web-search"],
    ["exa","exa-company-auto-text-search"],["google-places","google-places-text-search-enterprise"]]);
  const searchRoute=buildHybridSearchRoute(minimalPlan).map(step=>{
    const tariffKey=searchSourceByProvider.get(step.provider)??null;
    const rule=tariffKey?billingPolicy.rules.find(item=>item.key===tariffKey):undefined;
    const source=tariffKey?sourceStatus.get(tariffKey):undefined;
    return {category:step.category,track:step.track,provider:step.provider,trigger:step.trigger,
      tariffKey,tariffStatus:!rule?"missing-strict-contract":source?.hold?"held-for-review"
        :Date.parse(rule.expiresAt)<=Date.now()?"expired":"static-bound-present",
      publicEvidenceStatus:source?.status??"not-tracked",publicHold:source?.hold??null,
      maximumPerCallUsd:rule?rule.maximumChargeMicros/1e6:null,
      actualRequestContractChecked:false};
  });
  const tavilyRule=billingPolicy.rules.find(item=>item.key==="tavily-standard-search");
  const tavilyState=sourceStatus.get("tavily-standard-search");
  const supplementalEvidence={provider:"tavily",tariffKey:tavilyRule?.key??null,
    tariffStatus:!tavilyRule?"missing-strict-contract":tavilyState?.hold?"held-for-review"
      :Date.parse(tavilyRule.expiresAt)<=Date.now()?"expired":"static-bound-present",
    publicEvidenceStatus:tavilyState?.status??"not-tracked",publicHold:tavilyState?.hold??null,
    maximumPerCallUsd:tavilyRule?tavilyRule.maximumChargeMicros/1e6:null,
    actualRequestContractChecked:false};
  const marketPlaybookWire=await captureMinimalPlaybookWire();
  const braveCoreWire=await captureMinimalBraveWire();
  const after=await readSpendBudget(userId);
  if(Number(after.budget?.occupied_micros)!==Number(budget.budget.occupied_micros))
    throw new Error("Read-only wire preview changed budget occupancy");
  console.log(JSON.stringify({mode:"read-only-prerequisite-preview",limitUsd:30,occupiedUsd:Number(budget.budget.occupied_micros)/1e6,
    remainingUsd:Number(budget.budget.remaining_micros)/1e6,frozen:budget.budget.frozen,
    firstRoundPoolForOneTarget:plannedCandidatePool({targetCount:1,acceptedCount:0,discoveredUniqueCount:0,round:0}),
    stages,searchRoute,supplementalEvidence,marketPlaybookWire,braveCoreWire,
    checkedTariffsAvailable:stages.every(stage=>stage.tariff==="available")
      &&searchRoute.every(route=>route.tariffStatus==="static-bound-present")
      &&supplementalEvidence.tariffStatus==="static-bound-present",
    coreSearchBoundPresent:searchRoute.filter(route=>route.trigger==="core")
      .every(route=>route.tariffStatus==="static-bound-present"),
    allSearchRouteBoundsPresent:searchRoute.every(route=>route.tariffStatus==="static-bound-present"),
    actualRequestContractsChecked:false,
    checkedSingleCallBoundsFit:stages.every(stage=>stage.tariff==="available"&&stage.fitsCurrentRemainingBudget),
    totalRunBoundUsd:null,limitations:"Lists configured minimal-plan discovery and conditional review routes; captures synthetic playbook and Brave core provider wires. Real market requests, provider responses, remaining fallback/search/model contracts, conditional execution and total-run bound remain unverified",
    providerCalls:0,accountsModified:0,jobsClaimed:0},null,2));
}finally{await getPool().end();}
