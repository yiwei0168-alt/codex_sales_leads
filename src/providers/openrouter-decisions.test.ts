import {afterEach,expect,it,vi} from 'vitest';
import {buildDecisionRequest,parseDecisionResponse,acceptedRoute,validDecisionRequest,DECISION_URL,decisionModels} from './decision-contract';
import {requestDecision} from './openrouter-decisions';
import {quoteRequest,billingPolicy} from '@/lib/billing/policy';
import {assertRequestContract} from '@/lib/billing/request-contract';

const state={request:'查询合成公司的资料',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false};
const answer=(model:string=decisionModels[0])=>({id:'gen-dec-fixture',model,provider:'TypeSafe',usage:{input_tokens:500,output_tokens:20,cost:0.000021},
  answers:{route:{type:'choice',choice:'fixed_workflow',confidence:0.96,
    probabilities:{fixed_workflow:0.97,dynamic_agent:0.01,interpreter:0.01,uncertain:0.01}}}});
afterEach(()=>vi.unstubAllEnvs());
it.each(decisionModels)('uses Decisions wire contract and no retry for %s',async model=>{
  vi.stubEnv('OPENROUTER_API_KEY','synthetic-key');
  const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json(answer(model)));
  expect((await requestDecision(model,state,{transport})).model).toBe(model);
  expect(transport).toHaveBeenCalledOnce();
  const [url,init]=transport.mock.calls[0];expect(url).toBe(DECISION_URL);
  expect(JSON.parse(init!.body as string)).toEqual(buildDecisionRequest(model,state));
  expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal);
});
it.each([400,401,403,429,500])('does not retry HTTP %s',async status=>{
  vi.stubEnv('OPENROUTER_API_KEY','synthetic-key');
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('failure',{status}));
  await expect(requestDecision(decisionModels[0],state,{transport})).rejects.toThrow(`Decision HTTP ${status}`);
  expect(transport).toHaveBeenCalledOnce();
});
it('rejects incomplete or injected responses and wrong models',()=>{
  for(const body of [null,{}, {...answer(),error:{message:'hidden'}}, {...answer(),model:'typesafe/jev-latest'},
    {...answer(),answers:{route:{...answer().answers.route,choice:'send_mail'}}},
    {...answer(),answers:{route:{...answer().answers.route,probabilities:{...answer().answers.route.probabilities,fixed_workflow:0.1}}}}])
    expect(()=>parseDecisionResponse(body,decisionModels[0])).toThrow();
  expect(parseDecisionResponse(answer('typesafe/jev-1.14-20261014'),decisionModels[0]).model).toContain('20261014');
});
it('uses a provisional top probability and ambiguity margin; confidence is not accuracy',()=>{
  const response=parseDecisionResponse(answer(),decisionModels[0]);
  expect(acceptedRoute(response)).toBe('fixed_workflow');
  response.answers.route.probabilities={fixed_workflow:0.5,dynamic_agent:0.48,interpreter:0.01,uncertain:0.01};
  response.answers.route.confidence=1;expect(acceptedRoute(response)).toBe('dynamic_agent');
});
it('does not truncate or send oversized input',async()=>{
  const transport=vi.fn();await expect(requestDecision(decisionModels[0],{...state,request:'x'.repeat(6001)},{transport})).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
it.each(decisionModels)('admits only a bounded text decision contract for %s',model=>{
  const body=buildDecisionRequest(model,state),url=new URL(DECISION_URL);
  const rule=quoteRequest({origin:url.origin,pathname:url.pathname,model,requestBytes:Buffer.byteLength(JSON.stringify(body)),outputTokens:null},
    billingPolicy.rules,Date.parse('2026-11-09T01:00:00Z'));
  expect(rule.maximumOutputTokens).toBe(0);expect(()=>assertRequestContract(rule,body,'')).not.toThrow();
  for(const changed of [{...body,tools:[]},{...body,assets:{}},{...body,provider:{...body.provider,data_collection:'allow'}},
    {...body,questions:{...body.questions,second:body.questions.route}},{...body,state:{...state,history:['private']}}]){
    expect(validDecisionRequest(changed)).toBe(false);expect(()=>assertRequestContract(rule,changed,'')).toThrow();
  }
  expect(()=>assertRequestContract(rule,body,'?secret=x')).toThrow();
  expect(()=>assertRequestContract(rule,body,'','GET')).toThrow();
});
