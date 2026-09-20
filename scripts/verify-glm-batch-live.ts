import {readFile,writeFile,mkdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {getOpenRouterConfig} from "../src/providers/openrouter";
import {budgetedFetch} from "../src/lib/billing/paid-fetch";
import {withProductSpend} from "../src/lib/billing/context";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";
import {tenantQuery} from "../src/lib/rag/db";
import {createHash} from "node:crypto";
import {recordVerifiedCostObservation} from "../src/lib/billing/reconciliation";
import {reportedDollarsToMicros} from "../src/lib/billing/openrouter-cost-report";
import {providerUsageObservation} from "../src/lib/billing/provider-usage";
import {batchResponseSchema} from "../src/providers/openrouter-batch";
import {parseModelResponse} from "../src/lib/assistant/main/model";
const route=getOpenRouterConfig(),path="tmp/glm-batch-public-probe.json";
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const headers={...route.defaultHeaders,Authorization:`Bearer ${route.apiKey}`,"Content-Type":"application/json"};
try {
  await mkdir("tmp",{recursive:true});
  const previous=await readFile(path,"utf8").then(JSON.parse).catch(()=>null);
  if(!previous&&!process.argv.includes("--submit"))throw new Error("Explicit --submit required for one public synthetic batch");
  process.env.PRODUCT_FINANCIAL_POLICY="observe";
  let response:Response;const started=Date.now();
  if(previous?.batchId) {
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(previous.batchId))throw new Error("Invalid saved batch ID");
    response=await fetch(`${route.baseUrl}/batches/${previous.batchId}`,{headers,signal:AbortSignal.timeout(30000),redirect:"error"});
  } else {
    const payload={endpoint:"/v1/chat/completions",model:"z-ai/glm-5.3",provider:{only:["fireworks"]},completion_window:"24h",requests:[
      {custom_id:"text",body:{messages:[{role:"user",content:"Public synthetic route probe. Reply only OK."}],max_tokens:1024,reasoning:{effort:"low"}}},
      {custom_id:"tool",body:{messages:[{role:"user",content:"Public synthetic route probe. Call mark_probe with code OK exactly once."}],max_tokens:1024,reasoning:{effort:"low"},
        tools:[{type:"function",function:{name:"mark_probe",description:"Record public probe result",parameters:{type:"object",properties:{code:{type:"string",enum:["OK"]}},required:["code"],additionalProperties:false}}}],tool_choice:"auto"}},
    ]};
    response=await withProductSpend(OWNER_USER_ID,"main-agent-glm-batch-probe",()=>budgetedFetch(fetch)(`${route.baseUrl}/batches`,{method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(60000),redirect:"error"}),randomUUID());
  }
  const body=obj(await response.json().catch(()=>({}))),error=obj(body.error);
  if(response.ok)batchResponseSchema.parse(body);
  if(body.status==="completed"&&typeof body.id==="string") {
    for(const raw of body.results as unknown[]) {
      const row=obj(raw),parsedResult=parseModelResponse(obj(row.response).body);
      if(row.custom_id==="text"&&parsedResult.message.content!=="OK")throw new Error("Text probe result mismatch");
      if(row.custom_id==="tool") {
        const call=parsedResult.message.tool_calls?.[0];
        if(parsedResult.message.tool_calls?.length!==1||call?.function.name!=="mark_probe"||obj(JSON.parse(call.function.arguments)).code!=="OK")throw new Error("Tool probe result mismatch");
      }
    }
    const identity=createHash("sha256").update(body.id).digest("hex"),usage=obj(body.usage);
    const reservations=await tenantQuery<{id:string}>(OWNER_USER_ID,"select id from paid_call_reservation where user_id=$1 and stage='main-agent-glm-batch-probe' and provider_request_hash=$2",[OWNER_USER_ID,identity]);
    if(reservations.length!==1)throw new Error("Synthetic batch cost identity is not unique");
    await recordVerifiedCostObservation(OWNER_USER_ID,reservations[0].id,{kind:"provider-report",amountMicros:reportedDollarsToMicros(usage.cost),complete:false,sourceReferenceHash:createHash("sha256").update(`${identity}:batch-final-v1`).digest("hex"),sourceVersion:"openrouter-batch-public-probe-20260920",providerRequestHash:identity});
    await tenantQuery(OWNER_USER_ID,"update paid_call_reservation set metrics=metrics||$3::jsonb where user_id=$1 and id=$2",[OWNER_USER_ID,reservations[0].id,JSON.stringify({inputItems:2,validOutputItems:2,downstreamUsedItems:2,inputTokens:usage.prompt_tokens??null,outputTokens:usage.completion_tokens??null,apiCredits:usage.cost??null,providerUsage:providerUsageObservation(body,{httpStatus:200}),usageBoundary:"completed-public-batch-probe-used-for-route-acceptance",utilizationEfficiency:1,retries:0,discardedReasonCounts:{},optimizationOpportunity:"Use durable receipt polling and avoid repeated batch submissions"})]);
  }
  const summary={at:new Date().toISOString(),model:"z-ai/glm-5.3:batch",reportedModel:body.model,provider:"fireworks",httpStatus:response.status,batchId:body.id??previous?.batchId,status:body.status,
    error:{code:error.code,message:typeof error.message==="string"?error.message.replaceAll(route.apiKey,"[redacted]").slice(0,400):null},
    latencyMs:Date.now()-started,createdAt:body.created_at,finalizedAt:body.finalized_at,requestCounts:body.request_counts,usage:body.usage??null,
    results:Array.isArray(body.results)?body.results.map(v=>{const row=obj(v),res=obj(row.response),content=obj(res.body),choices=Array.isArray(content.choices)?content.choices:[],choice=obj(choices[0]),message=obj(choice.message);
      return {customId:row.custom_id,httpStatus:res.status_code,finishReason:choice.finish_reason,textOK:message.content==="OK",toolNames:Array.isArray(message.tool_calls)?message.tool_calls.map(c=>obj(obj(c).function).name):[],errorCode:obj(row.error).code};}):null,
    privateInputs:0,submitted:!previous?.batchId};
  await writeFile(path,JSON.stringify(summary,null,2)+"\n");
  console.log(JSON.stringify({...summary,batchId:summary.batchId?"saved-locally":undefined},null,2));
}finally{await getPool().end();}
