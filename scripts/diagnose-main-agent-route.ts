import {writeFile,mkdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {getOpenRouterConfig} from "../src/providers/openrouter";
import {budgetedFetch} from "../src/lib/billing/paid-fetch";
import {withProductSpend} from "../src/lib/billing/context";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";

// Explicit, bounded public-only diagnostics. Never changes product configuration,
// exposes a key or reads customer records. Every paid attempt is accounted for.
const args=process.argv.slice(2),route=getOpenRouterConfig();
const arg=(name:string)=>args[args.indexOf(name)+1];
const obj=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const safe=(value:unknown)=>typeof value==="string"?value.replaceAll(route.apiKey,"[redacted]")
  .replace(/\b(?:sk-|Bearer\s+)\S+/gi,"[redacted]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[email]").slice(0,600):value;
const report:Record<string,unknown>={at:new Date().toISOString(),mode:args.includes("--live")?"public-synthetic-live":"read-only-inventory",endpoint:route.baseUrl,privateInputs:0,configurationChanged:false};
const headers={...route.defaultHeaders,Authorization:`Bearer ${route.apiKey}`,"Content-Type":"application/json","X-OpenRouter-Metadata":"enabled"};
async function get(path:string,authenticated=false) {
  const response=await fetch(`${route.baseUrl}${path}`,{headers:authenticated?headers:undefined,signal:AbortSignal.timeout(30000),redirect:"error"});
  const body=await response.json().catch(()=>({}));
  return {status:response.status,body};
}
try {
  if(!args.includes("--live")) {
    const inventory=await get("/models");
    const models=Array.isArray(inventory.body.data)?inventory.body.data as Record<string,unknown>[]:[];
    report.catalog={status:inventory.status,count:models.length,models:models.filter(m=>typeof m.id==="string"&&(/^(openai\/gpt-(?:5\.[56]|6)|anthropic\/claude-(?:opus|fable|mythos)|google\/gemini-[34].*pro)/.test(m.id)||/glm.*5[.-]3/i.test(m.id)))
      .map(m=>({id:m.id,name:m.name,contextLength:m.context_length,supportedParameters:m.supported_parameters,pricing:m.pricing,...(/glm.*5[.-]3/i.test(String(m.id))?{description:m.description}:{} )}))};
    const key=await get("/key",true),data=obj(obj(key.body).data);
    report.authentication={status:key.status,isFreeTier:data.is_free_tier,limitConfigured:typeof data.limit==="number",limitExhausted:typeof data.limit_remaining==="number"?data.limit_remaining<=0:null,error:safe(obj(obj(key.body).error).message)};
    if(args.includes("--model")) {
      const model=arg("--model");if(!/^[a-z0-9._/:-]{1,160}$/i.test(model))throw new Error("Invalid model");
      const endpoints=await get(`/models/${model}/endpoints`),ed=obj(obj(endpoints.body).data);
      report.endpoints={status:endpoints.status,id:ed.id,endpoints:Array.isArray(ed.endpoints)?ed.endpoints.map((v:unknown)=>{const e=obj(v);return {provider:e.provider_name,tag:e.tag,name:e.name,status:e.status,supportedParameters:e.supported_parameters,pricing:e.pricing};}):[],error:safe(obj(obj(endpoints.body).error).message)};
    }
  } else {
    if(!args.includes("--model")||!args.includes("--provider"))throw new Error("Explicit --model and --provider required for one diagnostic route");
    const model=arg("--model"),provider=arg("--provider");
    if(!/^[a-z0-9._/:-]{1,160}$/i.test(model)||!/^[a-z0-9._/-]{1,100}$/i.test(provider))throw new Error("Invalid route");
    process.env.PRODUCT_FINANCIAL_POLICY="observe";
    const operation=randomUUID();const attempts:Record<string,unknown>[]=[];
    for(const toolsEnabled of [false,true]) {
      const payload={model,messages:[{role:"user",content:toolsEnabled?"Public synthetic route diagnostic. Call mark_probe with code OK exactly once. Do not provide any other content.":"Public synthetic route diagnostic. Reply only OK."}],max_completion_tokens:1024,
        provider:{...route.providerPreferences,only:[provider],allow_fallbacks:false},
        ...(toolsEnabled?{tools:[{type:"function",function:{name:"mark_probe",description:"Record public synthetic probe result",parameters:{type:"object",properties:{code:{type:"string",enum:["OK"]}},required:["code"],additionalProperties:false}}}],tool_choice:"auto",parallel_tool_calls:false}:{})};
      const started=Date.now();
      try {
        const response=await withProductSpend(OWNER_USER_ID,"main-agent-route-diagnostic",()=>budgetedFetch(fetch)(`${route.baseUrl}/chat/completions`,{method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(90000),redirect:"error"}),operation);
        const body=obj(await response.json().catch(()=>({}))),error=obj(body.error),metadata=obj(error.metadata);
        const choices=Array.isArray(body.choices)?body.choices:[],choice=obj(choices[0]),message=obj(choice.message);
        const calls=Array.isArray(message.tool_calls)?message.tool_calls:[];
        let toolCode:unknown;try{toolCode=obj(JSON.parse(String(obj(obj(calls[0]).function).arguments))).code;}catch{}
        const valid=response.ok&&(toolsEnabled?calls.length===1&&obj(obj(calls[0]).function).name==="mark_probe"&&toolCode==="OK":typeof message.content==="string"&&message.content.trim()==="OK");
        const usage=obj(body.usage);
        attempts.push({model,requestedProvider:provider,returnedModel:body.model,returnedProvider:body.provider,toolsEnabled,httpStatus:response.status,latencyMs:Date.now()-started,
          error:{code:error.code,message:safe(error.message),provider:safe(metadata.provider_name),raw:safe(typeof metadata.raw==="string"?metadata.raw:undefined)},
          validOutputItems:valid?1:0,downstreamUsedItems:valid?1:0,inputItems:1,inputTokens:usage.prompt_tokens??null,outputTokens:usage.completion_tokens??null,apiCredits:usage.cost??null,costUsd:usage.cost??null,retries:0,
          finishReason:choice.finish_reason,toolCount:calls.length,contentMatches:typeof message.content==="string"&&message.content.trim()==="OK"});
      } catch(error) {attempts.push({model,requestedProvider:provider,toolsEnabled,error:safe(error instanceof Error?error.message:"request-failed"),latencyMs:Date.now()-started,validOutputItems:0,downstreamUsedItems:0,inputItems:1,inputTokens:null,outputTokens:null,apiCredits:null,costUsd:null,retries:0});}
    }
    report.attempts=attempts;
  }
  await mkdir("tmp",{recursive:true});
  const name=`tmp/main-agent-route-${args.includes("--live")?"live":"inventory"}-${args.includes("--model")?arg("--model").replace(/[/\:]/g,"_"):"all"}${args.includes("--provider")?"-"+arg("--provider").replaceAll("/","_"):""}.json`;
  await writeFile(name,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}finally{await getPool().end();}
