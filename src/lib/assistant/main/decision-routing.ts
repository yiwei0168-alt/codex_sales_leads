import { acceptedRoute, buildDecisionRequest, DECISION_VERSION, decisionModelSchema, parseDecisionResponse,
  routeStateSchema, type DecisionModel, type DecisionResponse, type RouteState } from '@/providers/decision-contract';
import { DecisionRequestError, requestDecision } from '@/providers/openrouter-decisions';
import { BudgetDeniedError, PaidCallOutcomeUnknownError } from '@/lib/billing/policy';
import { withModelAttempt } from '@/lib/billing/model-attempt-context';
import { withProductSpend } from '@/lib/billing/context';
import { beginCall, completeCall } from './repository';
import { result, type ExecutionContext, type ModelMessage, type ToolResult } from './contracts';
import { hybridEnabled, hybridFirstAction } from './hybrid-routing';
import {DECISION_POLICY_VERSION,LEGACY_DECISION_POLICY_VERSION,knownDecisionPolicy} from '@/providers/decision-thresholds';

export function decisionRoutingConfig():{mode:'shadow'|'advisory';model:DecisionModel}|null {
  const mode = process.env.HYBRID_DECISION_MODE;
  const model = decisionModelSchema.safeParse(process.env.HYBRID_DECISION_MODEL ?? 'typesafe/jev-1.14');
  return (mode === 'shadow' || mode === 'advisory') && model.success ? {mode,model:model.data} : null;
}

/** No summaries or archive content are sent. Never truncate a request to make it look simpler. */
export function decisionState(messages: ModelMessage[], hasPolicy: boolean): RouteState | null {
  if(hasPolicy || !messages.some(m=>m.role==='system'&&/^\[hybrid-v[1247]:eligible\]/.test(m.content??''))
    || messages.some(m=>m.role==='assistant'||m.role==='tool') || hybridFirstAction(messages)) return null;
  const users=messages.filter(m=>m.role==='user');
  if(users.length!==1) return null;
  const parsed=routeStateSchema.safeParse({request:users[0].content,hasHistory:false,
    hasAttachments:false,hasKnowledgeScope:false,hasPolicy:false});
  return parsed.success?parsed.data:null;
}

export interface DecisionJournal {
  begin: (input: unknown) => Promise<{id:string;fresh:boolean;status:string;output:ToolResult|null}>;
  save: (id:string, output:ToolResult, metrics:Record<string,unknown>) => Promise<void>;
  request: (model:DecisionModel,state:RouteState,id:string) => Promise<DecisionResponse>;
}
export interface RoutedDecision {response:DecisionResponse;policyVersion:string}
/** Unknown/failed attempts are never sent again on recovery. Only this optional route falls back. */
export async function journaledDecision(model:DecisionModel,state:RouteState,journal:DecisionJournal):Promise<RoutedDecision|null> {
  const saved=await journal.begin(buildDecisionRequest(model,state));
  if(!saved.fresh){
    if(saved.status!=='completed'||saved.output?.status!=='success')return null;
    try{
      const data=saved.output.data;
      if(data&&typeof data==='object'&&'response' in data){
        if(!('policyVersion' in data)||typeof data.policyVersion!=='string'||!knownDecisionPolicy(data.policyVersion))return null;
        return {response:parseDecisionResponse(data.response,model),policyVersion:data.policyVersion};
      }
      // Pre-calibration receipts retain their original 0.9/0.2 policy, without another paid request.
      return {response:parseDecisionResponse(data,model),policyVersion:LEGACY_DECISION_POLICY_VERSION};
    }catch{return null;}
  }
  const started=Date.now();let response:DecisionResponse;
  try{response=await journal.request(model,state,saved.id);}
  catch(error){
    const unknown=error instanceof PaidCallOutcomeUnknownError||!(error instanceof DecisionRequestError||error instanceof BudgetDeniedError);
    const reason=error instanceof DecisionRequestError?`${error.reason}${error.status?`_${error.status}`:''}`
      :error instanceof BudgetDeniedError?error.code:'transport_or_receipt_unknown';
    await journal.save(saved.id,result(null,{status:unknown?'unknown':'unavailable',missing:['Routing unavailable; use dynamic planning. No router retry.']}),
      {model,reason,latencyMs:Date.now()-started,retry:false});
    return null;
  }
  // A failure saving a successful receipt must not be reclassified or retried.
  const decision={response,policyVersion:DECISION_POLICY_VERSION};
  await journal.save(saved.id,result(decision),{model,responseModel:response.model,provider:response.provider,
    generationId:response.id,usage:response.usage,latencyMs:Date.now()-started,route:acceptedRoute(response,decision.policyVersion),policyVersion:decision.policyVersion});
  return decision;
}

export function decisionHint(decision:RoutedDecision):ModelMessage {
  const path=acceptedRoute(decision.response,decision.policyVersion);
  return {role:'system',content:`[${DECISION_VERSION}] 阈值版本：${decision.policyVersion}。执行路径建议：${path}。此建议不是业务事实、授权或范围裁剪。先核对原始问题的全部要求；不适合时直接使用普通动态工具。fixed_workflow 只可使用已提供的只读流程，仍须确定公司和参数；interpreter 只可调用获准本地只读工具，不能外部搜索、评分、写入或发信。uncertain 或低确定性已回退 dynamic_agent。最终由当前选定主模型作答，保留引用、未读范围及未完成要求。`};
}

export async function prepareDecisionRoute(context:ExecutionContext,messages:ModelMessage[],hasPolicy:boolean):Promise<ModelMessage|null> {
  const config=decisionRoutingConfig();
  if(!hybridEnabled()||context.evaluationArm||!config)return null;
  const state=decisionState(messages,hasPolicy);if(!state)return null;
  if(config.model==='typesafe/jev-1.14'&&messages.some(m=>m.role==='system'&&m.content?.startsWith('[hybrid-v7:eligible]'))){
    const {prepareProgramDecision}=await import('./program-decision-routing-v7');
    return prepareProgramDecision(context,{...state,mode:context.mode??'deep'},config.mode);
  }
  if(config.model==='typesafe/jev-1.14'&&messages.some(m=>m.role==='system'&&m.content?.startsWith('[hybrid-v4:eligible]'))){
    const {prepareProgramDecision}=await import('./program-decision-routing-v4');
    return prepareProgramDecision(context,{...state,mode:context.mode??'deep'},config.mode);
  }
  if(config.model==='typesafe/jev-1.14'&&messages.some(m=>m.role==='system'&&m.content?.startsWith('[hybrid-v2:eligible]'))){
    const {prepareProgramDecision}=await import('./program-decision-routing');
    return prepareProgramDecision(context,{...state,mode:context.mode??'deep'},config.mode);
  }
  const response=await withProductSpend(context.userId,'hybrid-decision',()=>journaledDecision(config.model,state,{
    begin:input=>beginCall({...context,instructionIds:[]},{key:DECISION_VERSION,tool:'decision_router',version:DECISION_VERSION,input,effect:'model'}),
    save:(id,output,metrics)=>completeCall(context,id,output,{...metrics,mode:config.mode}),
    request:(model,input,id)=>withModelAttempt({invocationId:id,provider:'openrouter',task:'hybrid-decision',promptVersion:DECISION_VERSION,attempt:1},
      ()=>requestDecision(model,input)),
  }));
  return response&&config.mode==='advisory'?decisionHint(response):null;
}
