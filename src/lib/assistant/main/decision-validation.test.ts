import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({begin:vi.fn(),save:vi.fn(),request:vi.fn()}));
vi.mock('./repository',()=>({beginCall:mocks.begin,completeCall:mocks.save}));
vi.mock('@/providers/openrouter-decisions',async original=>({...await original<typeof import('@/providers/openrouter-decisions')>(),requestDecision:mocks.request}));
import source from '../../../../experiments/decision-routing-validation/cases-v2.json';
import {validationCaseSchema,validationInput,validatedOutcome,summarizeValidation,type ValidationOutcome} from './decision-validation';
import {prepareDecisionRoute} from './decision-routing';
import {parseDecisionResponse} from '@/providers/decision-contract';
const cases=source.map(s=>validationCaseSchema.parse(s));
const context={userId:'synthetic-user',runId:'synthetic-run',leaseToken:'synthetic-lease',role:'member' as const};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('keeps 48 distinct inference cases and 12 guarded cases before live validation',()=>{
  expect(cases).toHaveLength(60);expect(new Set(cases.map(s=>s.request)).size).toBe(60);
  for(const sample of cases)expect(Boolean(validationInput(sample).state)).toBe(!sample.guard);
});
it.each(cases.filter(s=>s.guard))('production skips the decision provider for $id',async sample=>{
  vi.stubEnv('HYBRID_DECISION_MODE','advisory');vi.stubEnv('ENABLE_HYBRID_EXECUTION','1');
  const input=validationInput(sample);
  expect(await prepareDecisionRoute(context,input.messages,sample.guard==='policy')).toBeNull();
  expect(mocks.begin).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();
  expect(input.ruleRoute).toBe(sample.expected);
});
it.each(['off','shadow','advisory'])('honors %s without executing business tools',async mode=>{
  vi.stubEnv('HYBRID_DECISION_MODE',mode);vi.stubEnv('HYBRID_DECISION_MODEL','typesafe/jev-1.14');vi.stubEnv('ENABLE_HYBRID_EXECUTION','1');
  const response=parseDecisionResponse({id:'gen-synthetic',model:'typesafe/jev-1.14',usage:{input_tokens:1,output_tokens:1},
    answers:{route:{type:'choice',choice:'fixed_workflow',confidence:0.5,probabilities:{fixed_workflow:0.6,dynamic_agent:0.2,interpreter:0.1,uncertain:0.1}}}},'typesafe/jev-1.14');
  mocks.begin.mockResolvedValue({id:'call-1',fresh:true,status:'started',output:null});mocks.save.mockResolvedValue(undefined);mocks.request.mockResolvedValue(response);
  const result=await prepareDecisionRoute(context,validationInput(cases[0]).messages,false);
  if(mode==='off'){expect(result).toBeNull();expect(mocks.request).not.toHaveBeenCalled();}
  else{expect(mocks.request).toHaveBeenCalledOnce();expect(mocks.save).toHaveBeenCalledOnce();
    if(mode==='shadow')expect(result).toBeNull();else{expect(result?.content).toContain('fixed_workflow');expect(result?.tool_calls).toBeUndefined();}}
});
it('excludes historical evaluation arms even when advisory is enabled',async()=>{
  vi.stubEnv('HYBRID_DECISION_MODE','advisory');
  expect(await prepareDecisionRoute({...context,evaluationArm:'candidate'},validationInput(cases[0]).messages,false)).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
});
const perfect=():ValidationOutcome[]=>cases.map(s=>({id:s.id,status:s.guard?'guarded':'completed',appliedRoute:s.expected,latencyMs:s.guard?null:100}));
it('fails the gate on unsafe interpreter/fixed advice even with full coverage',()=>{
  const rows=perfect();expect(summarizeValidation(cases,rows).gatePassed).toBe(true);
  rows.find(r=>r.id==='D19')!.appliedRoute='fixed_workflow';rows.find(r=>r.id==='D20')!.appliedRoute='interpreter';
  expect(summarizeValidation(cases,rows)).toMatchObject({gatePassed:false,unsafeIds:['D19','D20']});
});
it('does not pass a zero-coverage all-dynamic router or missing/failed validation',()=>{
  const rows=perfect().map(r=>r.status==='completed'?{...r,appliedRoute:'dynamic_agent'}:r);
  expect(summarizeValidation(cases,rows).gatePassed).toBe(false);
  expect(summarizeValidation(cases,perfect().slice(0,-1)).gatePassed).toBe(false);
  const failed=perfect();failed.slice(0,3).forEach(r=>{r.status='failed-or-unknown';r.appliedRoute='dynamic_agent';});
  expect(summarizeValidation(cases,failed).gatePassed).toBe(false);
});
it('rejects duplicate observations and preserves uncertain as dynamic',()=>{
  expect(()=>summarizeValidation(cases,[...perfect(),perfect()[0]])).toThrow('identity');
  const response=parseDecisionResponse({id:'gen-uncertain',model:'typesafe/jev-1.14',usage:{input_tokens:1,output_tokens:1},answers:{route:{type:'choice',choice:'uncertain',confidence:1,
    probabilities:{fixed_workflow:0,dynamic_agent:0,interpreter:0,uncertain:1}}}},'typesafe/jev-1.14');
  expect(validatedOutcome('F01',response,10).appliedRoute).toBe('dynamic_agent');
});
