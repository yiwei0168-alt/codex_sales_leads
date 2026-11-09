import policy from '../../../../config/agent/jev-program-policy-v3.json';
import { buildProgramDecisionRequest, PROGRAM_DECISION_VERSION, PROGRAM_DECISION_MODEL,
  programResponseSchema, programRoute, type ProgramRouteState, type ProgramDecisionResponse, type ProgramPolicy } from '@/providers/program-decision-contract';
import { requestProgramDecision } from '@/providers/program-decisions';
import { withProductSpend } from '@/lib/billing/context';
import { withModelAttempt } from '@/lib/billing/model-attempt-context';
import { beginCall, completeCall } from './repository';
import { result, type ExecutionContext, type ModelMessage, type ToolResult } from './contracts';

export interface ProgramJournal {
  begin:(input:unknown)=>Promise<{id:string;fresh:boolean;status:string;output:ToolResult|null}>;
  save:(id:string,output:ToolResult,metrics:Record<string,unknown>)=>Promise<void>;
  request:(state:ProgramRouteState,id:string)=>Promise<ProgramDecisionResponse>;
}
export async function journaledProgramDecision(state:ProgramRouteState,journal:ProgramJournal,thresholds:ProgramPolicy=policy){
  if(state.hasHistory||state.hasAttachments||state.hasPolicy||state.hasKnowledgeScope)return null;
  const saved=await journal.begin(buildProgramDecisionRequest(state));
  let response:ProgramDecisionResponse;
  if(!saved.fresh){
    if(saved.status!=='completed'||saved.output?.status!=='success')return null;
    const data=saved.output.data as {response?:unknown;policyVersion?:string}|null;
    // Never reinterpret legacy local-only or unknown-policy receipts using new permissions.
    if(data?.policyVersion!==thresholds.version)return null;
    const parsed=programResponseSchema.safeParse(data.response);if(!parsed.success)return null;
    response=parsed.data;
  }else{
    const start=Date.now();
    try{response=await journal.request(state,saved.id);}
    catch{
      await journal.save(saved.id,result(null,{status:'unknown',missing:['Optional router unavailable. Continue dynamically; no router retry.']}),
        {model:PROGRAM_DECISION_MODEL,latencyMs:Date.now()-start,retry:false});
      return null;
    }
    await journal.save(saved.id,result({response,policyVersion:thresholds.version}),{model:PROGRAM_DECISION_MODEL,
      generationId:response.id,usage:response.usage,latencyMs:Date.now()-start,policyVersion:thresholds.version});
  }
  return programRoute(response,thresholds,state);
}
export async function prepareProgramDecision(context:ExecutionContext,state:ProgramRouteState,mode:'shadow'|'advisory'):Promise<ModelMessage|null>{
  const route=await withProductSpend(context.userId,'hybrid-decision',()=>journaledProgramDecision(state,{
    begin:input=>beginCall({...context,instructionIds:[]},{key:PROGRAM_DECISION_VERSION,tool:'decision_router',version:PROGRAM_DECISION_VERSION,input,effect:'model'}),
    save:(id,output,metrics)=>completeCall(context,id,output,{...metrics,mode}),
    request:(input,id)=>withModelAttempt({invocationId:id,provider:'openrouter',task:'hybrid-decision',promptVersion:PROGRAM_DECISION_VERSION,attempt:1},()=>requestProgramDecision(input)),
  }));
  return route&&mode==='advisory'?{role:'system',content:`[${PROGRAM_DECISION_VERSION}] 建议 ${route}。这只是执行方式建议，不是授权或业务事实。核对全部原始需求与当前模式。fixed_workflow 使用现有固定读取；interpreter 使用 programmatic_tools 执行已规划的多步片段，必要时 tools.handoff 交回主模型，再规划下一段；dynamic_agent 先用主模型判断。不得裁剪后续任务或凭代码推断业务事实。最终回答保持来源与未完成范围。`}:null;
}
