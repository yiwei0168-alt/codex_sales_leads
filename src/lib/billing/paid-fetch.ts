import {currentSpendContext} from "./context";
import {paidRequestFingerprint} from "./paid-request-fingerprint";
import {billingPolicy,BudgetDeniedError,PaidCallOutcomeUnknownError,quoteRequest} from "./policy";
import {reservePaidCall,settlePaidCall} from "./repository";
import {recordBudgetDenial} from "./denial-metrics";
import {isKimiK3} from "@/providers/kimi-contract";
import {providerUsageObservation} from "./provider-usage";
import {currentModelAttempt,metricIdentifier} from "./model-attempt-context";
import {assertRequestContract} from "./request-contract";
import {nativeModelBound} from "./native-model-bound";
import {embeddingModelBound} from "./embedding-model-bound";
import {embeddingOutputCompletion} from "./embedding-output-policy";
import {textOutputCompletion} from "./text-output-policy";
import {openRouterInlineCostReport,reportedDollarsToMicros} from "./openrouter-cost-report";
import {recordVerifiedCostObservation} from "./reconciliation";
import {searchRequestFingerprint} from "./search-request-fingerprint";
import {currentStagePaidCallOverride} from "./stage-paid-call-override";
import {createHash} from "node:crypto";
import {modelRoutedTransport} from "@/lib/network/model-transport";

function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function count(value:unknown):number|null{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;}
/** Install at a provider transport boundary, including every retry. No headers/body/URL query are persisted. */
export function budgetedFetch(transport:typeof fetch=fetch):typeof fetch {
  return async(input,init)=>{
    const routedTransport=modelRoutedTransport(transport,input,init);
    const scope=currentSpendContext();
    // CLI experiments retain their separately approved accounting. Product entry points establish a scope.
    if(!scope)return routedTransport(input,init);
    const checkedAt=Date.now();
    try {
    const request=new Request(input,init);const url=new URL(request.url);
    request.signal.throwIfAborted();
    const body=await request.clone().text();let parsed:Record<string,unknown>={};
    if(body){
      if(request.headers.get("content-type")?.split(";")[0].trim()==="application/x-www-form-urlencoded"){
        // Form providers are still endpoint/size bounded; never log form values.
        const form=new URLSearchParams(body);
        if(["model","stream","max_tokens","max_completion_tokens"].some(key=>form.has(key)))throw new BudgetDeniedError("request-out-of-bounds");
      }else{try{parsed=object(JSON.parse(body));}catch{throw new BudgetDeniedError("request-out-of-bounds");}}
    }
    if(parsed.stream===true)throw new BudgetDeniedError("request-out-of-bounds");
    if(typeof parsed.model==="string"&&isKimiK3(parsed.model)&&!count(parsed.max_completion_tokens))throw new BudgetDeniedError("request-out-of-bounds");
    const outputTokens=count(parsed.max_completion_tokens??parsed.max_tokens??object(parsed.generation_config).max_output_tokens);
    const bytes=Buffer.byteLength(body,"utf8")+Buffer.byteLength(url.search,"utf8");
    const policy=scope.tariffPolicy??billingPolicy;
    const quote={origin:url.origin,pathname:url.pathname,model:typeof parsed.model==="string"?parsed.model:"",requestBytes:bytes,outputTokens};
    let native: Awaited<ReturnType<typeof nativeModelBound>> = null;
    const attempt=currentModelAttempt();
    const playbookSol=attempt?.task==="lead-playbook"&&quote.origin==="https://openrouter.ai"
      &&quote.pathname==="/api/v1/chat/completions"&&quote.model==="openai/gpt-5.6-sol";
    const reviewTerra=attempt?.task==="lead-review-secondary"&&quote.origin==="https://openrouter.ai"
      &&quote.pathname==="/api/v1/chat/completions"&&quote.model==="openai/gpt-5.6-terra";
    const judgeSol=attempt?.task==="lead-review-judge"&&quote.origin==="https://openrouter.ai"
      &&quote.pathname==="/api/v1/chat/completions"&&quote.model==="openai/gpt-5.6-sol";
    const ragAnswerSol=attempt?.task==="rag-answer"&&quote.origin==="https://openrouter.ai"
      &&quote.pathname==="/api/v1/chat/completions"&&quote.model==="openai/gpt-5.6-sol";
    const ragProvider=ragAnswerSol&&Array.isArray(object(parsed.provider).only)
      ?object(parsed.provider).only as unknown[]:[];
    const selectedContract=playbookSol?"openrouter-sol-openai-playbook-credits"
      :reviewTerra?"openrouter-terra-review-credits-standard-json"
        :judgeSol?"openrouter-sol-judge-credits-standard-json"
          :ragAnswerSol&&ragProvider.length===1&&ragProvider[0]==="openai"
            ?"openrouter-sol-rag-answer-primary-credits"
            :ragAnswerSol&&ragProvider.length===1&&ragProvider[0]==="amazon-bedrock/us-east-1"
              ?"openrouter-sol-rag-answer-bedrock-fallback-credits":undefined;
    const admissionOverride=currentStagePaidCallOverride(scope.userId);
    let rule;
    let costBoundKnown=true;
    try{
      native=!scope.tariffPolicy?(await nativeModelBound(quote)??await embeddingModelBound(quote)):null;
      rule=native?.rule??(scope.tariffPolicy?quoteRequest(quote,policy.rules):selectedContract
        ?quoteRequest(quote,policy.rules,Date.now(),selectedContract):quoteRequest(quote));
    }catch(error){
      if(!(error instanceof BudgetDeniedError)||!admissionOverride?.allowFinancialAdmissionBypass)throw error;
      // MA05 removes monetary uncertainty gates, not malformed/unsafe wire contracts.
      if(admissionOverride.ruleId==="MA05"&&error.code==="request-out-of-bounds")throw error;
      costBoundKnown=false;
      const routeHash=createHash("sha256").update(`${quote.origin}\n${quote.pathname}\n${quote.model}`).digest("hex").slice(0,16);
      rule={key:`a33-unbounded-${routeHash}`,origin:quote.origin,pathname:quote.pathname,model:quote.model,
        maximumChargeMicros:0,maximumRequestBytes:0,maximumOutputTokens:0,
        boundDescription:"A33 exact-owner temporary authorization; no reviewed monetary bound is asserted.",
        reference:"https://example.invalid/a33-owner-observation-mode",verifiedAt:new Date(0).toISOString(),expiresAt:new Date(0).toISOString()};
    }
    // Provider/data/tool wire safety is not a financial gate and remains enforced when a contract is known.
    if(rule.requestContract)assertRequestContract(rule,parsed,url.search,request.method,request.headers);
    // A33 is observation-only even when a reviewed tariff exists: no pre-call monetary reservation is asserted.
    if(admissionOverride?.allowFinancialAdmissionBypass)costBoundKnown=false;
    const modelAttempt=attempt?{
      invocationId:metricIdentifier(attempt.invocationId),provider:metricIdentifier(attempt.provider),
      task:metricIdentifier(attempt.task),promptVersion:metricIdentifier(attempt.promptVersion),
      ...(attempt.scoringVersion?{scoringVersion:metricIdentifier(attempt.scoringVersion)}:{}),
      attempt:Number.isSafeInteger(attempt.attempt)&&attempt.attempt>0?attempt.attempt:null,
      requestedModel:metricIdentifier(parsed.model),gatewayHost:metricIdentifier(url.hostname),
      endpointKind:url.pathname.endsWith("/chat/completions")?"chat-completions":url.pathname.endsWith("/messages")?"messages":url.pathname.endsWith("/embeddings")?"embeddings":"other",
    }:typeof parsed.model==="string"?{
      invocationId:null,provider:null,task:metricIdentifier(scope.stage),promptVersion:null,attempt:null,
      requestedModel:metricIdentifier(parsed.model),gatewayHost:metricIdentifier(url.hostname),
      endpointKind:url.pathname.endsWith("/chat/completions")?"chat-completions":url.pathname.endsWith("/messages")?"messages":url.pathname.endsWith("/embeddings")?"embeddings":"other",
    }:null;
    // Native model adapters without full invocation attribution need the same persistent guard.
    // Preserve existing model hashes; admitted synchronous searches also guard paid replay.
    const requestFingerprint=!costBoundKnown||attempt||typeof parsed.model==="string"
      ?paidRequestFingerprint(request.method,url,body):searchRequestFingerprint(rule,request,parsed);
    const id=await reservePaidCall(scope.userId,{operationId:scope.operationId,stage:scope.stage,tariffKey:rule.key,
      tariffVersion:costBoundKnown?(native?.version??policy.version):admissionOverride!.ruleId,
      maximumChargeMicros:costBoundKnown?rule.maximumChargeMicros:0,costBoundKnown,requestBytes:bytes,modelAttempt,requestFingerprint,
      foreignCostBound:rule.foreignCostBound,costAttribution:scope.costAttribution});
    const started=Date.now();let response:Response;
    try{response=await routedTransport(input,{...init,redirect:"error"});}catch{
      await settlePaidCall(scope.userId,id,{reportedMicros:null,latencyMs:Date.now()-started,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false}).catch(()=>undefined);
      throw new PaidCallOutcomeUnknownError();
    }
    let responseText:string;
    try{responseText=await response.clone().text();}catch{
      await settlePaidCall(scope.userId,id,{reportedMicros:null,latencyMs:Date.now()-started,responseBytes:null,inputTokens:null,outputTokens:null,succeeded:false}).catch(()=>undefined);
      throw new PaidCallOutcomeUnknownError();
    }
    // Accounting failure cannot turn successful paid work into a retry. Reservation remains occupied.
    try{
      const text=responseText;let result:Record<string,unknown>={};try{result=object(JSON.parse(text));}catch{}
      const usage=object(result.usage);const reported=reportedDollarsToMicros(usage.cost);
      const outputIncomplete=response.ok&&(textOutputCompletion(attempt?.outputCompletionTask??attempt?.task,result)==="incomplete"
        ||embeddingOutputCompletion(attempt?.task,result,parsed)==="incomplete");
      await settlePaidCall(scope.userId,id,{reportedMicros:reported,latencyMs:Date.now()-started,responseBytes:Buffer.byteLength(text,"utf8"),inputTokens:count(usage.prompt_tokens??usage.input_tokens??usage.total_tokens),outputTokens:count(usage.completion_tokens??usage.output_tokens),succeeded:response.ok&&!outputIncomplete,outputIncomplete,providerUsage:providerUsageObservation(result,{httpStatus:response.status,generationId:response.headers.get("x-generation-id")})});
      const report=openRouterInlineCostReport({url,method:request.method,httpStatus:response.status,request:parsed,response:result});
      if(report)await recordVerifiedCostObservation(scope.userId,id,report);
    }catch{console.warn(JSON.stringify({event:"budget-settlement-unavailable",reservationRetained:true,retry:false}));}
    return response;
    }catch(error){
      if(error instanceof BudgetDeniedError&&!(error instanceof PaidCallOutcomeUnknownError))await recordBudgetDenial(scope,error,Date.now()-checkedAt);
      throw error;
    }
  };
}
