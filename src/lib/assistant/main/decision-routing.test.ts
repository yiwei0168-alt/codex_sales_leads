import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./repository',()=>({beginCall:vi.fn(),completeCall:vi.fn()}));
import {decisionRoutingConfig,decisionState,journaledDecision,decisionHint,type DecisionJournal} from './decision-routing';
import {parseDecisionResponse,decisionModels} from '@/providers/decision-contract';
import {PaidCallOutcomeUnknownError} from '@/lib/billing/policy';
import {DecisionRequestError} from '@/providers/openrouter-decisions';
import {result,type ModelMessage} from './contracts';
import {decisionRoutingSamples} from './decision-routing-samples';

const model=decisionModels[0];
const messages=(request='帮我比较本地多家公司的资料'):ModelMessage[]=>[{role:'system',content:'[hybrid-v1:eligible]'},{role:'user',content:request}];
const state={request:'合成请求',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false};
const response=parseDecisionResponse({id:'gen-fixture',model,usage:{input_tokens:100,output_tokens:20},answers:{route:{type:'choice',choice:'interpreter',
  confidence:0.99,probabilities:{fixed_workflow:0,dynamic_agent:0.01,interpreter:0.99,uncertain:0}}}},model);
const journal=():DecisionJournal=>({begin:vi.fn().mockResolvedValue({id:'call-1',fresh:true,status:'started',output:null}),
  request:vi.fn().mockResolvedValue(response),save:vi.fn().mockResolvedValue(undefined)});
afterEach(()=>vi.unstubAllEnvs());
it('defaults off and pins the candidate while supporting explicit comparison',()=>{
  vi.stubEnv('HYBRID_DECISION_MODE','');expect(decisionRoutingConfig()).toBeNull();
  vi.stubEnv('HYBRID_DECISION_MODE','shadow');vi.stubEnv('HYBRID_DECISION_MODEL',undefined);
  expect(decisionRoutingConfig()).toEqual({mode:'shadow',model});
  vi.stubEnv('HYBRID_DECISION_MODEL',decisionModels[1]);expect(decisionRoutingConfig()?.model).toBe(decisionModels[1]);
  vi.stubEnv('HYBRID_DECISION_MODEL','~typesafe/jev-latest');expect(decisionRoutingConfig()).toBeNull();
});
it('skips rules, history, scopes, attachments, policies and oversized inputs without trimming',()=>{
  expect(decisionState(messages(),false)?.request).toBe(messages()[1].content);
  expect(decisionState(messages('查看 Atlas 最新进展'),false)).toBeNull();
  expect(decisionState(messages(),true)).toBeNull();
  expect(decisionState(messages('x'.repeat(6001)),false)).toBeNull();
  expect(decisionState([{role:'system',content:'[hybrid-v1]'},messages()[1]],false)).toBeNull();
  expect(decisionState([...messages(),{role:'assistant',content:'history'}],false)).toBeNull();
  expect(decisionState([...messages(),{role:'user',content:'followup'}],false)).toBeNull();
});
it('saves response before exposing a strictly enumerated advisory hint',async()=>{
  const deps=journal();expect(await journaledDecision(model,state,deps)).toEqual(response);
  expect(deps.save).toHaveBeenCalledWith('call-1',result(response),expect.objectContaining({route:'interpreter'}));
  const hint=decisionHint(response);expect(hint.content).toContain('interpreter');expect(hint.tool_calls).toBeUndefined();
  expect(hint.content).not.toContain('gen-fixture');
});
it.each(['started','unknown','failed'])('never reissues %s receipts',async status=>{
  const deps=journal();vi.mocked(deps.begin).mockResolvedValue({id:'call-1',fresh:false,status,output:null});
  expect(await journaledDecision(model,state,deps)).toBeNull();expect(deps.request).not.toHaveBeenCalled();
});
it('reuses completed replies on recovery',async()=>{
  const deps=journal();vi.mocked(deps.begin).mockResolvedValue({id:'call-1',fresh:false,status:'completed',output:result(response)});
  expect(await journaledDecision(model,state,deps)).toEqual(response);expect(deps.request).not.toHaveBeenCalled();
});
it.each([new PaidCallOutcomeUnknownError(),new DecisionRequestError('http',403),new DecisionRequestError('invalid_response')])('falls back once without a second model: %s',async error=>{
  const deps=journal();vi.mocked(deps.request).mockRejectedValue(error);
  expect(await journaledDecision(model,state,deps)).toBeNull();expect(deps.request).toHaveBeenCalledOnce();expect(deps.save).toHaveBeenCalledOnce();
});
it('does not swallow a failed successful-receipt save or lease loss',async()=>{
  const deps=journal();vi.mocked(deps.save).mockRejectedValue(new Error('receipt-store'));
  await expect(journaledDecision(model,state,deps)).rejects.toThrow('receipt-store');expect(deps.request).toHaveBeenCalledOnce();
  const stopped=journal();vi.mocked(stopped.begin).mockRejectedValue(new Error('lease-lost'));
  await expect(journaledDecision(model,state,stopped)).rejects.toThrow('lease-lost');expect(stopped.request).not.toHaveBeenCalled();
});
it('keeps synthetic development and holdout template families separate',()=>{
  expect(decisionRoutingSamples).toHaveLength(128);expect(new Set(decisionRoutingSamples.map(s=>s.id)).size).toBe(128);
  const dev=new Set(decisionRoutingSamples.filter(s=>s.split==='development').map(s=>s.family));
  expect(decisionRoutingSamples.filter(s=>s.split==='holdout').every(s=>!dev.has(s.family))).toBe(true);
});
