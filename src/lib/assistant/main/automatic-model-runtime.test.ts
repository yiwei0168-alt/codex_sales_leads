import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({begin:vi.fn(),save:vi.fn(),event:vi.fn(),request:vi.fn()}));
vi.mock('./repository',async importOriginal=>({...await importOriginal<typeof import('./repository')>(),beginCall:mocks.begin,completeCall:mocks.save,event:mocks.event,boundary:async()=>({control:null,instructions:[]})}));
vi.mock('./memory-context',async importOriginal=>({...await importOriginal<typeof import('./memory-context')>(),loadDecisionMemory:async()=>[]}));
vi.mock('./consumption',()=>({recordConsumedToolOutputs:async()=>{}}));
vi.mock('./task-model-transport-request',()=>({taskTransportSigningConfigured:()=>false}));
vi.mock('./model',async importOriginal=>({...await importOriginal<typeof import('./model')>(),requestModeModel:mocks.request}));
import {durableModel} from './graph';
import {automaticModelConfig} from './automatic-execution';
import {programDecisionHint} from './program-decision-routing-v4';
import {result} from './contracts';
const context={userId:'owner',runId:'run',leaseToken:'lease',role:'member' as const,mode:'deep' as const};
beforeEach(()=>{vi.clearAllMocks();mocks.begin.mockResolvedValue({id:'call',fresh:true,status:'started',output:null});mocks.request.mockResolvedValue({message:{role:'assistant',content:'Synthetic answer'},provider:'fixture',generationId:'synthetic'});});
it.each([['fixed_workflow','quick'],['interpreter','standard'],['dynamic_agent','deep']] as const)('journals and requests the automatically selected %s profile %s',async(route,tier)=>{
  await durableModel(context,[{role:'system',content:'Fixture'},programDecisionHint(route),{role:'user',content:'Synthetic task'}],0,0,automaticModelConfig());
  expect(mocks.request).toHaveBeenCalledOnce();expect(mocks.request.mock.calls[0][1].mode).toBe(tier);
  expect(mocks.begin.mock.calls[0][1].input.profile).toEqual(mocks.request.mock.calls[0][1]);
  expect(mocks.save.mock.calls[0][3]).toMatchObject({automatic:true,executionAdvice:route,selectionVersion:'hybrid-auto-v1'});
  expect(context.mode).toBe('deep');
});
it('reuses saved automatic model success without another provider request',async()=>{
  mocks.begin.mockResolvedValue({id:'call',fresh:false,status:'completed',output:result({value:{message:{role:'assistant',content:'Already completed'},provider:'fixture'}})});
  const response=await durableModel(context,[{role:'system',content:'Fixture'},programDecisionHint('interpreter')],0,0,automaticModelConfig());
  expect(response.content).toBe('Already completed');expect(mocks.request).not.toHaveBeenCalled();
});
