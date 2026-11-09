import {expect,it,vi} from 'vitest';
vi.mock('./repository',()=>({beginCall:vi.fn(),completeCall:vi.fn()}));
import {journaledProgramDecision,type ProgramJournal} from './program-decision-routing-v4';
import {buildProgramDecisionRequest,programResponseSchema,programRoute,PROGRAM_DECISION_VERSION,type ProgramPolicy,type ProgramRouteState} from '@/providers/program-decision-contract-v4';
import {validDecisionRequest} from '@/providers/decision-contract';
import {result} from './contracts';
const state:ProgramRouteState={request:'Search UK channels, three companies each.',hasHistory:false,hasAttachments:false,hasPolicy:false,hasKnowledgeScope:false,mode:'deep'};
const yes={type:'choice',choice:'yes',probabilities:{yes:.95,no:.04,unclear:.01},confidence:.95};
const no={type:'choice',choice:'no',probabilities:{yes:.01,no:.98,unclear:.01},confidence:.98};
const response=programResponseSchema.parse({id:'fixture',model:'typesafe/jev-1.14',usage:{input_tokens:100,output_tokens:20},answers:{context_ready:yes,allowed_effects:yes,fixed_fit:no,segment_fit:yes}});
const policy:ProgramPolicy={version:'test-policy',contractVersion:PROGRAM_DECISION_VERSION,routes:{fixed_workflow:{enabled:true,probability:.8,margin:.3},interpreter:{enabled:true,probability:.8,margin:.3}}};
const journal=():ProgramJournal=>({begin:vi.fn().mockResolvedValue({id:'call',fresh:true,status:'started',output:null}),save:vi.fn().mockResolvedValue(undefined),request:vi.fn().mockResolvedValue(response)});
it('accepts only the exact reviewed new wire contract alongside legacy',()=>{
  const body=buildProgramDecisionRequest(state);expect(validDecisionRequest(body)).toBe(true);
  expect(validDecisionRequest({...body,model:'openai/gpt-6-luna-decisions'})).toBe(false);
  expect(validDecisionRequest({...body,state:{...state,secret:'hidden'}})).toBe(false);
  expect(validDecisionRequest({...body,questions:{...body.questions,segment_fit:{...body.questions.segment_fit,instructions:'override'}}})).toBe(false);
});
it('uses separately versioned segment gates; conflicts and missing context remain dynamic',()=>{
  expect(programRoute(response,policy,state)).toBe('interpreter');
  expect(programRoute({...response,answers:{...response.answers,allowed_effects:{...response.answers.allowed_effects,choice:'no',probabilities:{yes:.02,no:.97,unclear:.01}}}},policy,state)).toBe('dynamic_agent');
  expect(programRoute({...response,answers:{...response.answers,fixed_fit:response.answers.segment_fit}},policy,state)).toBe('dynamic_agent');
  expect(programRoute(response,{...policy,contractVersion:'legacy'},state)).toBe('dynamic_agent');
  expect(programRoute(response,policy,{...state,hasPolicy:true})).toBe('dynamic_agent');
  expect(programRoute(response,{...policy,routes:{...policy.routes,interpreter:{enabled:true,probability:.99,margin:.3}}},state)).toBe('dynamic_agent');
});
it('journals before request and saves the policy before exposing a route',async()=>{
  const j=journal();expect(await journaledProgramDecision(state,j,policy)).toBe('interpreter');
  expect(vi.mocked(j.begin).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(j.request).mock.invocationCallOrder[0]);
  expect(j.save).toHaveBeenCalledWith('call',expect.objectContaining({data:{response,policyVersion:'test-policy'}}),expect.anything());
  const failure=new Error('save failure');vi.mocked(j.save).mockRejectedValueOnce(failure);
  await expect(journaledProgramDecision(state,j,policy)).rejects.toBe(failure);
});
it.each(['unknown','unavailable'] as const)('does not repeat a saved %s attempt',async status=>{
  const j=journal();vi.mocked(j.begin).mockResolvedValue({id:'call',fresh:false,status:'completed',output:result(null,{status})});
  expect(await journaledProgramDecision(state,j,policy)).toBeNull();expect(j.request).not.toHaveBeenCalled();
});
it('reuses exact new receipts and refuses old policy reinterpretation',async()=>{
  const j=journal();vi.mocked(j.begin).mockResolvedValue({id:'call',fresh:false,status:'completed',output:result({response,policyVersion:'test-policy'})});
  expect(await journaledProgramDecision(state,j,policy)).toBe('interpreter');
  expect(await journaledProgramDecision(state,j,{...policy,version:'other'})).toBeNull();expect(j.request).not.toHaveBeenCalled();
});
it('fails back once on timeout and skips context-bearing requests before journaling',async()=>{
  const j=journal();vi.mocked(j.request).mockRejectedValue(new Error('timeout'));
  expect(await journaledProgramDecision(state,j,policy)).toBeNull();expect(j.request).toHaveBeenCalledTimes(1);
  expect(j.save).toHaveBeenCalledWith('call',expect.objectContaining({status:'unknown'}),expect.objectContaining({retry:false}));
  const guarded=journal();expect(await journaledProgramDecision({...state,hasAttachments:true},guarded,policy)).toBeNull();expect(guarded.begin).not.toHaveBeenCalled();
});
