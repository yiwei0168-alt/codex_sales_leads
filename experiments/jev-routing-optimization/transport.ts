import {currentSpendContext} from '../../src/lib/billing/context';
import {budgetedFetch} from '../../src/lib/billing/paid-fetch';
import {getOpenRouterConfig,openRouterRequestHeaders} from '../../src/providers/openrouter';
import {DECISION_URL,type RouteState} from '../../src/providers/decision-contract';
import {atomicResponseSchema,buildAtomicRequest} from './contract';

/** CLI-only candidate. It cannot relax the production one-question billing contract. */
export async function requestAtomic(state:RouteState,transport?:typeof fetch){
  if(currentSpendContext())throw Error('Experimental routing is not enabled for product calls');
  const body=JSON.stringify(buildAtomicRequest(state));
  if(Buffer.byteLength(body,'utf8')>32768)throw Error('Input too large');
  const response=await budgetedFetch(transport)(DECISION_URL,{method:'POST',
    headers:openRouterRequestHeaders(getOpenRouterConfig()),body,redirect:'error',signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw Error(`Atomic HTTP ${response.status}`);
  return atomicResponseSchema.parse(await response.json());
}
