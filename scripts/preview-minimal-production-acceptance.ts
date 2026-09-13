import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const {query,getPool}=await import("../src/lib/rag/db");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const {quoteRequest,BudgetDeniedError}=await import("../src/lib/billing/policy");
const {assertRequestContract}=await import("../src/lib/billing/request-contract");
const {nativeModelBound}=await import("../src/lib/billing/native-model-bound");
const {embeddingModelBound}=await import("../src/lib/billing/embedding-model-bound");
const {getRagConfig}=await import("../src/lib/rag/config");
const {resolveOpenRouterModel}=await import("../src/providers/openrouter");
const {deepSeekRequestBody}=await import("../src/providers/deepseek-request");
const {textOutputLimit}=await import("../src/lib/billing/text-output-policy");
const {plannedCandidatePool}=await import("../src/lib/leads/workflow/target-completion-policy");
const userId="cbee9803-3c43-4609-9228-66086b207012";
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
    try{await buildLeadMarketPlaybook({countryCode:"CO",countryName:"Colombia",objective:"new-market",
      roles:["Distributor"],targetCount:1,queryLanguage:"es",userRequest:"Synthetic acceptance wire only"},ragContext);}
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
try{
  const identity=await query<{safe:boolean}>("select (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe from app_user where id=$1",[userId]);
  if(identity[0]?.safe!==true)throw new Error("Acceptance identity differs; no execution allowed");
  const budget=await readSpendBudget(userId);
  if(!budget.budget||String(budget.budget.limit_micros)!=="30000000")throw new Error("Acceptance ceiling differs");
  const rag=getRagConfig();
  const probes:Array<{stage:string;url:string;model:string;outputTokens:number|null;requestBytes:number}>=[];
  const kimiBase=process.env.KIMI_BASE_URL?.trim()||"https://api.moonshot.cn/v1";
  for(const [stage,model] of [["intent-light",process.env.KIMI_INTENT_LIGHT_MODEL?.trim()||"kimi-k2.6"],
    ["intent-complex-conditional",process.env.KIMI_INTENT_MODEL?.trim()||process.env.KIMI_MODEL?.trim()||"kimi-k3"]]){
    probes.push({stage,url:`${kimiBase.replace(/\/$/,"")}/chat/completions`,model,outputTokens:4000,requestBytes:0});
  }
  probes.push({stage:"knowledge-embedding",url:`${rag.embeddingBaseUrl.replace(/\/$/,"")}/embeddings`,model:rag.embeddingModel,outputTokens:null,requestBytes:0});
  probes.push({stage:"market-playbook",url:`${rag.openaiBaseUrl}/chat/completions`,
    model:resolveOpenRouterModel(process.env.LEAD_PLANNER_MODEL?.trim()||process.env.OPENAI_GENERATION_MODEL?.trim()||"gpt-5-mini","openai"),
    outputTokens:textOutputLimit("lead-playbook"),requestBytes:0});
  const model=process.env.DEEPSEEK_MODEL?.trim()||"deepseek-v4-flash";
  const wire=deepSeekRequestBody({task:"lead-qualification",modelVersion:model,promptVersion:"preflight-only",input:{},evidenceIds:[]});
  probes.push({stage:"primary-role-score",url:`${(process.env.DEEPSEEK_BASE_URL?.trim()||"https://api.deepseek.com").replace(/\/$/,"")}${wire.useAnthropicTransport?"/anthropic/v1/messages":"/chat/completions"}`,
    model,outputTokens:JSON.parse(wire.body).max_tokens,requestBytes:Buffer.byteLength(wire.body)});
  const stages=[];
  for(const probe of probes){
    const url=new URL(probe.url);
    if(url.username||url.password||url.search)throw new Error("Unexpected endpoint credentials or query");
    try{
      const input={origin:url.origin,pathname:url.pathname,model:probe.model,requestBytes:probe.requestBytes,outputTokens:probe.outputTokens};
      const bound=(await nativeModelBound(input)??await embeddingModelBound(input))?.rule??quoteRequest(input);
      stages.push({stage:probe.stage,model:probe.model,tariff:"available",maximumPerCallUsd:bound.maximumChargeMicros/1e6,
        fitsCurrentRemainingBudget:bound.maximumChargeMicros<=Number(budget.budget.remaining_micros),expiresAt:bound.expiresAt});
    }catch(error){
      if(!(error instanceof BudgetDeniedError))throw error;
      stages.push({stage:probe.stage,model:probe.model,tariff:error.code});
    }
  }
  const marketPlaybookWire=await captureMinimalPlaybookWire();
  const after=await readSpendBudget(userId);
  if(Number(after.budget?.occupied_micros)!==Number(budget.budget.occupied_micros))
    throw new Error("Read-only wire preview changed budget occupancy");
  console.log(JSON.stringify({mode:"read-only-prerequisite-preview",limitUsd:30,occupiedUsd:Number(budget.budget.occupied_micros)/1e6,
    remainingUsd:Number(budget.budget.remaining_micros)/1e6,frozen:budget.budget.frozen,
    firstRoundPoolForOneTarget:plannedCandidatePool({targetCount:1,acceptedCount:0,discoveredUniqueCount:0,round:0}),stages,marketPlaybookWire,
    checkedTariffsAvailable:stages.every(stage=>stage.tariff==="available"),actualRequestContractsChecked:false,
    checkedSingleCallBoundsFit:stages.every(stage=>stage.tariff==="available"&&stage.fitsCurrentRemainingBudget),
    totalRunBoundUsd:null,limitations:"Checks tariff availability, individual bounds, and one synthetic market-playbook SDK wire; no real market context, search/review/fallback routes, API credentials, or total-run bound validated",
    providerCalls:0,accountsModified:0,jobsClaimed:0},null,2));
}finally{await getPool().end();}
