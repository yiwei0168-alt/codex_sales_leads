import {beforeEach,expect,it,vi} from 'vitest';
import {durableModel} from './graph';
import {modeModelConfig} from './mode-config';
const m=vi.hoisted(()=>({begin:vi.fn(),save:vi.fn(),factory:vi.fn(),signed:vi.fn(),unsigned:vi.fn(),enabled:true}));
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
