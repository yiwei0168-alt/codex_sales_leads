import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const {query,tenantQuery,getPool}=await import("../src/lib/rag/db");
const {getRagConfig}=await import("../src/lib/rag/config");
const {withSpendContext}=await import("../src/lib/billing/context");
const {budgetedFetch}=await import("../src/lib/billing/paid-fetch");
const {setSpendBudget,readSpendBudget}=await import("../src/lib/billing/repository");
const {tariffSchema}=await import("../src/lib/billing/policy");
const {kimiOutputLimit}=await import("../src/providers/kimi-contract");

// Fixed disabled/no-password identity retains reservations across resume; no customer data.
const userId="cbee9803-3c43-4609-9228-66086b207012";
const operationId="local-production-model-acceptance-2026-09-12";
const version="acceptance-text-only-2026-09-12-v1";
let lockClient:import("pg").PoolClient|undefined;
const prompt='Return exactly this JSON object: {"acceptance":"ok"}. No tools or external research.';
const config=getRagConfig();
const probes=[
  {stage:"openrouter-text",base:config.openaiBaseUrl,key:config.openaiApiKey,model:config.generationModel,allowed:"openai/gpt-5.6-sol",reference:"https://openrouter.ai/openai/gpt-5.6-sol",inputRate:5.5,outputRate:33,currency:"USD",basis:"provider-table-upper-rate"},
  {stage:"deepseek-text",base:process.env.DEEPSEEK_BASE_URL||"https://api.deepseek.com",key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||"deepseek-v4-flash",allowed:"deepseek-v4-pro",reference:"https://api-docs.deepseek.com/quick_start/pricing/",inputRate:1.32,outputRate:3.96,currency:"USD",basis:"official-peak-cache-miss"},
  ...[process.env.KIMI_INTENT_LIGHT_MODEL||"kimi-k2.6",process.env.KIMI_INTENT_MODEL||process.env.KIMI_MODEL||"kimi-k3"].map((model,index)=>({stage:`kimi-${index?"planning":"intent"}`,base:process.env.KIMI_BASE_URL||"https://api.moonshot.cn/v1",key:process.env.KIMI_API_KEY,model,allowed:index?"kimi-k3":"kimi-k2.6",reference:"https://developers.openai.com/api/docs/pricing",inputRate:10,outputRate:50,currency:"USD",basis:"user-approved-openai-reference-not-kimi-invoice"})),
  {stage:"embedding",base:config.embeddingBaseUrl,key:config.embeddingApiKey,model:config.embeddingModel,allowed:"text-embedding-v4",reference:"https://help.aliyun.com/zh/model-studio/text-embedding-v4",inputRate:0.5,outputRate:0,currency:"CNY",basis:"official-beijing-no-usd-fx-claim"},
];
try{
  if(!process.argv.includes("--run")){
    console.log(JSON.stringify({mode:"preview",budgetUsd:30,reservationPerAttemptUsd:2,maximumFirstPassReservedUsd:10,automaticRetries:0,stages:probes.map(p=>({stage:p.stage,model:p.model,configured:Boolean(p.key),reviewedModel:p.model===p.allowed,rateBasis:p.basis}))}));
  }else{
    lockClient=await getPool().connect();
    const lock=await lockClient.query<{locked:boolean}>("select pg_try_advisory_lock(hashtextextended($1,0)) as locked",[operationId]);
    if(!lock.rows[0].locked)throw new Error("acceptance-already-running");
    await query("insert into app_user(id,email,display_name,status,role) values($1,'model-acceptance-20260912@fixture.invalid','Local model acceptance audit','disabled','member') on conflict(id) do nothing",[userId]);
    const identity=await query<{safe:boolean}>("select (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe from app_user where id=$1",[userId]);
    if(identity[0]?.safe!==true)throw new Error("fixture-identity-conflict");
    const existing=await readSpendBudget(userId);
    if(!existing.budget)await setSpendBudget(userId,30_000_000);
    // Never raise an existing budget on resume.
    const limits=await tenantQuery<{limit_micros:string}>(userId,"select limit_micros::text from user_spend_budget where user_id=$1",[userId]);
    if(BigInt(limits[0].limit_micros)>BigInt(30_000_000))throw new Error("acceptance-budget-conflict");
    for(const probe of probes){
      const prior=await tenantQuery<{passed:boolean|null}>(userId,"select (metrics->>'acceptancePassed')::boolean as passed from paid_call_reservation where user_id=$1 and operation_id=$2 and stage=$3",[userId,operationId,probe.stage]);
      if(prior.length){console.log(JSON.stringify({stage:probe.stage,status:"previous-attempt-retained-no-auto-retry",passed:prior.every(row=>row.passed===true)}));if(prior.some(row=>row.passed!==true))process.exitCode=1;continue;}
      if(!probe.key||probe.model!==probe.allowed){console.log(JSON.stringify({stage:probe.stage,status:"blocked-unreviewed-model-or-missing-key"}));process.exitCode=1;continue;}
      const embedding=probe.stage==="embedding";
      const url=new URL(`${probe.base.replace(/\/$/,"")}/${embedding?"embeddings":"chat/completions"}`);
      if(url.protocol!=="https:"||url.username||url.password||url.search)throw new Error("unsafe-endpoint");
      const body=JSON.stringify(embedding?{model:probe.model,input:["Local product acceptance fixture"],dimensions:config.embeddingDimensions}:{model:probe.model,messages:[{role:"user",content:prompt}],...(probe.stage.startsWith("kimi")?kimiOutputLimit(probe.model,4096):{max_tokens:4096}),...(probe.stage.startsWith("openrouter")?{provider:config.openaiProviderPreferences}:{})});
      // This isolated policy authorizes ONLY the constructed text fixture, no arbitrary caller payloads.
      const rule=tariffSchema.parse({key:probe.stage,origin:url.origin,pathname:url.pathname,model:probe.model,maximumChargeMicros:2_000_000,maximumRequestBytes:8192,maximumOutputTokens:embedding?0:4096,reference:probe.reference,verifiedAt:"2026-09-12T00:00:00Z",expiresAt:"2026-09-19T00:00:00Z",boundDescription:"Acceptance-only fixed single text response; no tools, plugins, media or multiple choices. At most 8192 UTF-8 bytes and 4096 output tokens including reasoning; USD 2 conservative reservation, reference estimates explicitly not invoices."});
      const started=Date.now();
      try{
        const response=await withSpendContext({userId,operationId,stage:probe.stage,tariffPolicy:{version,rules:[rule]}},()=>budgetedFetch()(url,{method:"POST",headers:{authorization:`Bearer ${probe.key}`,"content-type":"application/json"},body,signal:AbortSignal.timeout(60_000)}));
        const value=await response.json();
        const content=value.choices?.[0]?.message?.content;
        const vector=value.data?.[0]?.embedding;
        let valid=false;
        if(embedding)valid=Array.isArray(vector)&&vector.length===config.embeddingDimensions&&vector.every((v:unknown)=>typeof v==="number"&&Number.isFinite(v));
        else if(typeof content==="string"){try{valid=JSON.parse(content).acceptance==="ok";}catch{/* malformed output is not acceptance */}}
        valid=response.ok&&valid;
        const inputTokens=value.usage?.prompt_tokens??value.usage?.input_tokens;
        const outputTokens=value.usage?.completion_tokens??value.usage?.output_tokens??(embedding?0:undefined);
        const estimate=Number.isSafeInteger(inputTokens)&&Number.isSafeInteger(outputTokens)?(inputTokens*probe.inputRate+outputTokens*probe.outputRate)/1_000_000:null;
        const metrics={acceptancePassed:valid,validOutputItems:valid?1:0,downstreamUsedItems:valid?1:0,utilizationEfficiency:valid?1:0,rateEstimate:estimate,rateCurrency:probe.currency,rateBasis:probe.basis,retries:0,discardedReasonCounts:valid?{}:{invalidOrFailedResponse:1},usageBoundary:"synthetic-provider-contract-not-business-e2e",optimizationOpportunity:"Reuse retained acceptance result; do not rerun successful provider probes"};
        await tenantQuery(userId,"update paid_call_reservation set metrics=metrics||$4::jsonb where user_id=$1 and operation_id=$2 and stage=$3",[userId,operationId,probe.stage,JSON.stringify(metrics)]);
        console.log(JSON.stringify({stage:probe.stage,httpStatus:response.status,valid,latencyMs:Date.now()-started,inputTokens,outputTokens,estimate,currency:probe.currency,basis:probe.basis}));
        if(!valid)process.exitCode=1;
      }catch(error){
        const code=error instanceof Error?error.name:"UnknownError";
        console.log(JSON.stringify({stage:probe.stage,status:"failed-or-unknown",errorClass:code,latencyMs:Date.now()-started,automaticRetry:false}));process.exitCode=1;
      }
      console.log(JSON.stringify({costCheckpoint:await readSpendBudget(userId)}));
    }
  }
}catch{console.error("Acceptance stopped safely; inspect retained aggregate reservations. No raw provider error emitted.");process.exitCode=1;}
finally{if(lockClient){await lockClient.query("select pg_advisory_unlock(hashtextextended($1,0))",[operationId]);lockClient.release();}await getPool().end();}
