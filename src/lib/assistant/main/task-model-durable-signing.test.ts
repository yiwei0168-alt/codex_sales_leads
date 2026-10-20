import {beforeEach,expect,it,vi} from 'vitest';
import {durableModel} from './graph';
import {modeModelConfig} from './mode-config';
import {attachModeTransportFailure} from './mode-transport-failure';
import {OpenRouterRequestError} from '@/providers/openrouter-batch';
import {createDurableSkillCandidateModel} from './skill-candidate-model';
import {digest} from './contracts';
const m=vi.hoisted(()=>({begin:vi.fn(),save:vi.fn(),factory:vi.fn(),signed:vi.fn(),unsigned:vi.fn(),candidateBegin:vi.fn(),candidateSave:vi.fn(),enabled:true}));
vi.mock('./skill-model-journal',()=>({createSkillModelJournal:()=>({begin:m.candidateBegin,save:m.candidateSave})}));
vi.mock('./repository',async original=>({...await original<typeof import('./repository')>(),
 boundary:async()=>({control:null,instructions:[]}),beginCall:m.begin,completeCall:m.save,event:async()=>{}}));
vi.mock('./memory-context',async original=>({...await original<typeof import('./memory-context')>(),loadDecisionMemory:async()=>[]}));
vi.mock('./consumption',async original=>({...await original<typeof import('./consumption')>(),recordConsumedToolOutputs:async()=>{}}));
vi.mock('./task-model-transport-request',()=>({taskTransportSigningConfigured:()=>m.enabled,createConfiguredTaskModeRequest:m.factory}));
vi.mock('./model',async original=>({...await original<typeof import('./model')>(),requestModeModel:m.unsigned}));
const context={userId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',
 leaseToken:'44444444-4444-4444-8444-444444444444',role:'member' as const};
const callId='33333333-3333-4333-8333-333333333333';
const messages=[{role:'system' as const,content:'Synthetic instructions'},{role:'user' as const,content:'Synthetic question'}];
const response=()=>({message:{role:'assistant' as const,content:'Synthetic signed reply'},provider:'synthetic',generationId:'synthetic-id',
 transportReceipt:{statement:{protocol:'TEST_ONLY_STUB'},signature:'TEST_ONLY_STUB'}});
beforeEach(()=>{
 vi.resetAllMocks();m.enabled=true;m.begin.mockResolvedValue({id:callId,fresh:true,output:null});
 m.signed.mockResolvedValue(response());m.factory.mockResolvedValue(m.signed);m.unsigned.mockResolvedValue({message:{role:'assistant',content:'Synthetic unsigned reply'}});
 m.candidateBegin.mockResolvedValue({id:callId,fresh:true,output:null});
});
it('passes only server-created attempt identity to signing and preserves the returned receipt in the durable outcome',async()=>{
 expect(await durableModel(context,messages,2,1,modeModelConfig('quick'))).toEqual(response().message);
 expect(m.factory).toHaveBeenCalledExactlyOnceWith(context,{callId,callKey:'mode-model:2:1:0'});
 expect(m.save.mock.calls[0][2]).toMatchObject({status:'success',data:{value:{transportReceipt:response().transportReceipt}}});
 expect(m.unsigned).not.toHaveBeenCalled();
});
it('reuses a saved signed outcome without another request or signing operation',async()=>{
 m.begin.mockResolvedValue({id:callId,fresh:false,output:{status:'success',data:{value:response()}}});
 expect(await durableModel(context,messages,0,0,modeModelConfig('quick'))).toEqual(response().message);
 expect(m.factory).not.toHaveBeenCalled();expect(m.signed).not.toHaveBeenCalled();expect(m.unsigned).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it('preserves normal unsigned requests when signing is not configured',async()=>{
 m.enabled=false;expect(await durableModel(context,messages,0,0,modeModelConfig('quick'))).toMatchObject({content:'Synthetic unsigned reply'});
 expect(m.unsigned).toHaveBeenCalledOnce();expect(m.factory).not.toHaveBeenCalled();
});
it('persists a signing admission failure and never silently falls back to unsigned transport',async()=>{
 m.factory.mockRejectedValue(new Error('Task transport enrollment unavailable'));
 await expect(durableModel(context,messages,0,0,modeModelConfig('quick'))).rejects.toThrow('enrollment unavailable');
 expect(m.save.mock.calls[0][2]).toMatchObject({status:'unavailable',data:{retryable:false}});
 expect(m.unsigned).not.toHaveBeenCalled();expect(m.signed).not.toHaveBeenCalled();
});
it('saves the original failure signature before requesting the fallback route',async()=>{
 const error=new OpenRouterRequestError(503,'provider-unavailable'),receipt={protocol:'TEST_ONLY_FAILURE_STUB'};
 attachModeTransportFailure(error,receipt);
 m.signed.mockImplementationOnce(async()=>{throw error;}).mockImplementationOnce(async()=>{
  expect(m.save).toHaveBeenCalledOnce();expect(m.save.mock.calls[0][2]).toMatchObject({status:'unavailable',data:{retryable:true,reason:'http-503',transportFailureReceipt:receipt}});
  return response();
 });
 expect(await durableModel(context,messages,0,0,modeModelConfig('quick'))).toEqual(response().message);
 expect(m.save).toHaveBeenCalledTimes(2);expect(m.unsigned).not.toHaveBeenCalled();
});
const evaluationId='55555555-5555-4555-8555-555555555555';
function candidate(request:()=>Promise<Record<string,unknown>>){
 return createDurableSkillCandidateModel({ownerId:context.userId,snapshotHash:digest('synthetic snapshot'),arm:'candidate'},
  {evaluationId,sourceKind:'synthetic-fixture',transaction:async()=>{throw new Error('Journal mocked; no database');},request},async()=>{}).model;
}
const decision=()=>({messages,profile:modeModelConfig('quick').profile!,step:2,signal:new AbortController().signal});
it('uses one response lifecycle across production and candidate, preserving signatures and established call namespaces',async()=>{
 const raw={...response(),message:{role:'assistant' as const,content:null,tool_calls:[{id:'provider-id',type:'function' as const,function:{name:'discover_tools',arguments:'{}'}}]}};
 m.signed.mockResolvedValue(raw);
 const production=await durableModel(context,messages,2,1,modeModelConfig('quick'));
 const request=vi.fn(async()=>raw),evaluated=await candidate(request)(decision());
 expect(production.tool_calls?.[0].id).toBe(`call_${digest({run:context.runId,step:2,revision:1,index:0,i:0,id:'provider-id'}).slice(0,40)}`);
 expect(evaluated.tool_calls?.[0].id).toBe(`call_${digest({evaluation:evaluationId,arm:'candidate',step:2,index:0,i:0,id:'provider-id'}).slice(0,40)}`);
 expect(raw.message.tool_calls[0].id).toBe('provider-id');
 expect(m.save.mock.calls[0][2].data.value.transportReceipt).toEqual(raw.transportReceipt);
 expect(m.candidateSave.mock.calls[0][2]).toMatchObject({status:'success',value:{transportReceipt:raw.transportReceipt}});
 expect(request).toHaveBeenCalledTimes(1);
});
it.each(['empty','duplicate','wrong-role'])('preserves rejected %s completed receipts and refuses consumption/replay in both adapters',async(kind)=>{
 const message=kind==='empty'?{role:'assistant',content:''}:kind==='wrong-role'?{role:'user',content:'Invalid provider role'}:
  {role:'assistant',content:null,tool_calls:[0,1].map(()=>({id:'duplicate',type:'function',function:{name:'discover_tools',arguments:'{}'}}))};
 const raw={...response(),message};m.signed.mockResolvedValue(raw);
 await expect(durableModel(context,messages,2,1,modeModelConfig('quick'))).rejects.toThrow();
 expect(m.signed).toHaveBeenCalledTimes(1);expect(m.save).toHaveBeenCalledTimes(1);
 expect(m.save.mock.calls[0][2]).toMatchObject({status:'unavailable',data:{retryable:false,reason:'completed-response-rejected',rejectedCompletedResponse:raw}});
 const request=vi.fn(async()=>raw);
 await expect(candidate(request)(decision())).rejects.toThrow();
 expect(request).toHaveBeenCalledTimes(1);expect(m.candidateSave).toHaveBeenCalledExactlyOnceWith(callId,0,{status:'unavailable',retryable:false,reason:'completed-response-rejected',rejectedCompletedResponse:raw});
 const rejected={status:'unavailable',data:{retryable:false,reason:'completed-response-rejected',rejectedCompletedResponse:raw}};
 m.begin.mockResolvedValue({id:callId,fresh:false,output:rejected});
 m.candidateBegin.mockResolvedValue({id:callId,fresh:false,output:rejected});
 await expect(durableModel(context,messages,2,1,modeModelConfig('quick'))).rejects.toThrow();
 await expect(candidate(request)(decision())).rejects.toThrow();
 expect(m.signed).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledTimes(1);
 expect(m.save).toHaveBeenCalledTimes(1);expect(m.candidateSave).toHaveBeenCalledTimes(1);
});
