import {expect,it} from 'vitest';
import {buildProgramDecisionRequest,programResponseSchema,programRoute} from './program-decision-contract-v5';
import {validDecisionRequest} from './decision-contract';
import {assertRequestContract} from '@/lib/billing/request-contract';
import {billingPolicy} from '@/lib/billing/policy';
import policy from '../../config/agent/jev-program-policy-v5.json';
import previous from '../../config/agent/jev-program-policy-v4.json';
const state={request:'Count all imported account mail by Beijing day from 2026-11-02 through 2026-11-05.',mode:'deep' as const,hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false};
const yes={type:'choice',choice:'yes',probabilities:{yes:.9,no:.05,unclear:.05},confidence:.8};
const no={type:'choice',choice:'no',probabilities:{yes:.02,no:.96,unclear:.02},confidence:.9};
const response=programResponseSchema.parse({id:'synthetic',model:'typesafe/jev-1.14',usage:{input_tokens:100,output_tokens:20},answers:{fixed_fit:no,segment_fit:yes,context_ready:yes,allowed_effects:yes}});
it('admits the exact candidate under existing bounded four-question pricing only',()=>{
 const body=buildProgramDecisionRequest(state),rule=billingPolicy.rules.find(r=>r.key==='openrouter-jev-program-decisions')!;
 expect(validDecisionRequest(body)).toBe(true);expect(()=>assertRequestContract(rule,body,'')).not.toThrow();
 for(const changed of [{...body,questions:{...body.questions,extra:{type:'choice'}}},{...body,state:{...state,userId:'foreign'}},{...body,provider:{...body.provider,allow_fallbacks:true}}]){
  expect(validDecisionRequest(changed)).toBe(false);expect(()=>assertRequestContract(rule,changed,'')).toThrow();
 }
});
it('preserves thresholds, explicit context guards and uncertain-read fallback',()=>{
 expect(policy.routes).toEqual(previous.routes);expect(programRoute(response,policy,state)).toBe('interpreter');
 expect(programRoute(response,previous,state)).toBe('dynamic_agent');
 for(const guard of ['hasHistory','hasAttachments','hasPolicy','hasKnowledgeScope'])expect(programRoute(response,policy,{...state,[guard]:true})).toBe('dynamic_agent');
 const uncertain=programResponseSchema.parse({...response,answers:{...response.answers,context_ready:{...yes,probabilities:{yes:.50,no:.26,unclear:.24}}}});
 expect(programRoute(uncertain,policy,state)).toBe('dynamic_agent');
 const denied=programResponseSchema.parse({...response,answers:{...response.answers,allowed_effects:no}});
 expect(programRoute(denied,policy,state)).toBe('dynamic_agent');
});
