import nextEnv from "@next/env";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
nextEnv.loadEnvConfig(process.cwd());
const {DeepSeekProvider}=await import("../src/providers/deepseek");
const {deepSeekRequestBody}=await import("../src/providers/deepseek-request");
const {tariffSchema,quoteRequest}=await import("../src/lib/billing/policy");
const {assertRequestContract}=await import("../src/lib/billing/request-contract");
const {query,tenantQuery,getPool}=await import("../src/lib/rag/db");
const {withSpendContext}=await import("../src/lib/billing/context");
const {readSpendBudget}=await import("../src/lib/billing/repository");
const {recordVerifiedCostObservation}=await import("../src/lib/billing/reconciliation");
const userId="cbee9803-3c43-4609-9228-66086b207012";
const operationId="local-production-model-acceptance-2026-09-12";
const stage="deepseek-flash-v41-method-validation-2026-09-13";
const policy=JSON.parse(readFileSync("config/billing/deepseek-text-bounds-candidate-2026-09-13.json","utf8"));
const rule=tariffSchema.parse(policy.rules.find((item:{model:string})=>item.model==="deepseek-flash"));
const request={task:"lead-discovery-gate" as const,modelVersion:"deepseek-flash",promptVersion:"flash-v41-token-audit-v1",
  input:{instruction:"Return exactly one JSON object with acceptance equal to ok. Synthetic method verification only; no research or tools."},
  evidenceIds:[],outputSchema:{type:"object",properties:{acceptance:{type:"string",const:"ok"}},required:["acceptance"],additionalProperties:false}};
let lockClient:import("pg").PoolClient|undefined;
let phase="request-preflight";
const estimateOnly=process.argv.includes("--reconcile-estimate");
try{
  const wire=deepSeekRequestBody(request);
  const endpoint=(process.env.DEEPSEEK_BASE_URL?.trim()||"https://api.deepseek.com").replace(/\/$/,"");
  assert.equal(endpoint,rule.origin);assert.equal(wire.useAnthropicTransport,false);
  const body=JSON.parse(wire.body);
  quoteRequest({origin:endpoint,pathname:rule.pathname,model:request.modelVersion,requestBytes:Buffer.byteLength(wire.body),outputTokens:body.max_tokens},[rule]);
  assertRequestContract(rule,body,"");
  if(!process.argv.includes("--run")&&!estimateOnly){
    console.log(JSON.stringify({mode:"preview",stage,maximumAdditionalReservedUsd:rule.maximumChargeMicros/1e6,
      cumulativeCeilingUsd:30,automaticRetries:0,requestBytes:Buffer.byteLength(wire.body),globalTariffChange:false}));
  }else{
    phase="acceptance-identity-and-budget";
    lockClient=await getPool().connect();
    const lock=await lockClient.query("select pg_try_advisory_lock(hashtextextended($1,0)) as locked",[operationId]);
    assert.equal(lock.rows[0].locked,true);
    const identity=await query<{safe:boolean}>("select (email='model-acceptance-20260912@fixture.invalid' and status='disabled' and password_hash is null) as safe from app_user where id=$1",[userId]);
    assert.equal(identity[0]?.safe,true);
    const budget=await readSpendBudget(userId);
    assert.ok(budget.budget);assert.ok(BigInt(String(budget.budget.limit_micros))<=BigInt(30_000_000));
    const prior=await tenantQuery(userId,"select metrics->>'acceptancePassed' as passed from paid_call_reservation where user_id=$1 and operation_id=$2 and stage=$3",[userId,operationId,stage]);
    if(estimateOnly)assert.equal(prior.length,1);
    if(prior.length){
      console.log(JSON.stringify({stage,status:"prior-attempt-retained-no-replay",passed:prior.every(row=>row.passed==="true")}));
      if(prior.some(row=>row.passed!=="true"))process.exitCode=1;
    }else{
      phase="isolated-offline-tokenizer";
      const encoded=spawnSync("docker",["run","--rm","-i","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--user","65534:65534","sales-tokenizer-audit:20260913","--stdin"],
        {input:JSON.stringify({body,parts:[]})+"\n",encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:65536});
      assert.equal(encoded.status,0);
      const count=JSON.parse(encoded.stdout.trim());assert.equal(count.encoding,"v41");assert.ok(Number.isSafeInteger(count.total)&&count.total>0);
      phase="single-budgeted-provider-attempt";
      const provider=new DeepSeekProvider({maxAttempts:1});assert.equal(provider.isConfigured(),true);
      const response=await withSpendContext({userId,operationId,stage,tariffPolicy:{version:policy.version,rules:[rule]}},()=>provider.execute<unknown,{acceptance:string}>(request,AbortSignal.timeout(60000)));
      const outputValid=response.output?.acceptance==="ok"&&Object.keys(response.output).length===1;
      const inputTokens=response.usage?.promptTokens;
      const matches=inputTokens===count.total;
      const modelRecognized=["deepseek-flash","deepseek-v4-flash","DeepSeek-V4.1-Flash"].includes(response.modelVersion);
      const passed=outputValid&&matches&&modelRecognized;
      await tenantQuery(userId,"update paid_call_reservation set metrics=metrics||$4::jsonb where user_id=$1 and operation_id=$2 and stage=$3",[userId,operationId,stage,JSON.stringify({acceptancePassed:passed,
        offlineInputTokens:count.total,hostedInputTokens:inputTokens??null,tokenCountMatch:matches,validatedOutputItems:outputValid?1:0,
        downstreamUsedItems:passed?1:0,usageBoundary:"single-synthetic-v41-method-validation-not-business-quality",optimizationOpportunity:"Do not replay this retained validation; matching one fixture does not prove a universal hosted token bound"})]);
      console.log(JSON.stringify({stage,outputValid,modelRecognized,tokenCountMatch:matches,offlineInputTokens:count.total,hostedInputTokens:inputTokens??null,
        outputTokens:response.usage?.completionTokens??null,model:response.modelVersion,latencyMs:response.latencyMs,automaticRetries:0,
        businessE2eAccepted:false}));
      if(!passed)process.exitCode=1;
    }
    if(estimateOnly){
      phase="append-usage-estimate-no-model-call";
      const retained=await tenantQuery<{id:string;input_tokens:number;output_tokens:number}>(userId,"select id,(metrics->>'inputTokens')::int as input_tokens,(metrics->>'outputTokens')::int as output_tokens from paid_call_reservation where user_id=$1 and operation_id=$2 and stage=$3",[userId,operationId,stage]);
      const row=retained[0];assert.ok(Number.isSafeInteger(row.input_tokens)&&row.input_tokens>=0&&Number.isSafeInteger(row.output_tokens)&&row.output_tokens>=0);
      const micros=Number((BigInt(row.input_tokens)*BigInt(30)+BigInt(row.output_tokens)*BigInt(120)+BigInt(99))/BigInt(100));
      const observation=await recordVerifiedCostObservation(userId,row.id,{kind:"usage-estimate",amountMicros:micros,complete:false,
        sourceReferenceHash:createHash("sha256").update(`${row.id}:deepseek-flash-peak-cache-miss-20260913`).digest("hex"),sourceVersion:"deepseek-flash-peak-cache-miss-20260913"});
      assert.equal(observation.releasedMicros,0);
      console.log(JSON.stringify({stage,estimatedMicros:micros,estimateBasis:"official-peak-all-input-cache-miss-rounded-up",newModelCalls:0,releasedMicros:0}));
    }
    const result=await readSpendBudget(userId);
    console.log(JSON.stringify({budget:result.budget,invoiceStatus:"unknown-no-reservation-release"}));
  }
}catch(error){
  console.error(JSON.stringify({stage,phase,status:"stopped-preserve-reservations",errorClass:error instanceof Error?error.name:"UnknownError",automaticRetry:false}));process.exitCode=1;
}finally{
  if(lockClient){await lockClient.query("select pg_advisory_unlock(hashtextextended($1,0))",[operationId]);lockClient.release();}
  await getPool().end();
}
