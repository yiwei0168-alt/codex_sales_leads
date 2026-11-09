import {expect,it,vi} from 'vitest';
import {failureDiagnostic} from './failure-diagnostic';
import {orderedModeDecision} from '../assistant/main/mode-fallback';
it('captures nested socket codes without messages, credentials or arbitrary fields',()=>{
 const e=new TypeError('private mail and token',{cause:Object.assign(new Error('https://secret'),{code:'UND_ERR_SOCKET',headers:{authorization:'secret'}})});
 expect(failureDiagnostic(e)).toEqual({version:'network-failure-diagnostic-v1',chain:[{name:'TypeError',code:null},{name:'Error',code:'UND_ERR_SOCKET'}]});
 expect(JSON.stringify(failureDiagnostic({name:'secret',code:'SECRET',message:'password'}))).not.toMatch(/secret|password/i);
});
it('bounds cycles and nested causes',()=>{
 const e:{name:string;cause?:unknown}={name:'TimeoutError'};e.cause=e;
 expect(failureDiagnostic(e).chain).toHaveLength(1);
 let nested:unknown=new Error();for(let i=0;i<10;i++)nested={name:'Error',cause:nested};
 expect(failureDiagnostic(nested).chain).toHaveLength(4);
});
it('records diagnostics without turning an uncertain reset into an automatic retry',async()=>{
 const error=new TypeError('private',{cause:{code:'ECONNRESET'}}),request=vi.fn(async()=>{throw error;}),save=vi.fn();
 await expect(orderedModeDecision({begin:async()=>({id:'one',fresh:true}),request,save})).rejects.toBe(error);
 expect(request).toHaveBeenCalledTimes(1);
 expect(save.mock.calls[0][2]).toMatchObject({retryable:false,reason:'requires-reconciliation-or-configuration',failureDiagnostic:{chain:[{name:'TypeError',code:null},{name:'OtherError',code:'ECONNRESET'}]}});
});
