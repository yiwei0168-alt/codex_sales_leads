import {budgetedFetch} from '@/lib/billing/paid-fetch';
import {getOpenRouterConfig,openRouterRequestHeaders} from './openrouter';
import {DECISION_URL} from './decision-contract';
import {buildProgramDecisionRequest,programResponseSchema,type ProgramRouteState} from './program-decision-contract-v6';
import {DecisionRequestError} from './openrouter-decisions';

export async function requestProgramDecision(state:ProgramRouteState,transport?:typeof fetch){
  const body=JSON.stringify(buildProgramDecisionRequest(state));
  if(Buffer.byteLength(body,'utf8')>32768)throw Error('Decision input too large');
  const response=await budgetedFetch(transport)(DECISION_URL,{method:'POST',body,
    headers:openRouterRequestHeaders(getOpenRouterConfig()),redirect:'error',signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw new DecisionRequestError('http',response.status);
  try{return programResponseSchema.parse(await response.json());}catch{throw new DecisionRequestError('invalid_response');}
}
