import {expect,it,vi,afterEach} from 'vitest';
import {prepareRecordedModeRequest} from './model-request-replay';
import {modelFunctions,transportMessages} from './model';
import {modelRequestManifest} from './model-request-manifest';
import {modeModelConfig} from './mode-config';
import {digest} from './contracts';
afterEach(()=>vi.unstubAllEnvs());
function fixture(mode:'quick'|'standard'|'deep',index:number){
 const profile=modeModelConfig(mode).profile!;
 const messages=[{role:'system' as const,content:'Original mode prompt and exact registered tools'},
  {role:'user' as const,content:'Private original context — must stay internal'}];
 const body={model:profile.routes[index].model,messages:transportMessages(messages),tools:modelFunctions,
  stream:true,max_tokens:16384,tool_choice:'auto',reasoning:{effort:profile.routes[index].effort},provider:{allow_fallbacks:false,data_collection:'deny'}};
 const input={messages,profile,index};
 const output={status:'success',data:{value:{requestManifest:modelRequestManifest(body,{model:body.model,provider:'original-provider',id:'generation-fixture'})}}};
 return {call:{input,input_hash:digest(input),output},body};
}
it.each(['quick','standard','deep'] as const)('preserves %s main and both fallback bodies, schema and deadlines',mode=>{
 for(const index of [0,1,2]){
  const {call,body}=fixture(mode,index);const prepared=prepareRecordedModeRequest(call);
  expect(prepared.body).toEqual(body);expect(digest(prepared.body)).toBe(prepared.requestHash);
  expect(prepared.routeIndex).toBe(index);expect(prepared.deadlines).toEqual({firstOutputMs:call.input.profile.firstOutputMs,totalMs:call.input.profile.totalMs});
  expect(prepared).toMatchObject({scope:'one-recorded-model-request',serverProvenanceVerified:false,sourcePermissionsRevalidated:false,executionAuthorized:false,qualityAccepted:false});
 }
});
it('does not rebuild original provider settings from current environment or mutate source inputs',()=>{
 const {call,body}=fixture('standard',1),expected=structuredClone(body);
 vi.stubEnv('OPENROUTER_PROVIDER_PREFERENCES_JSON','{"data_collection":"allow"}');
 const prepared=prepareRecordedModeRequest(call);call.input.messages[1].content='later mutation';
 expect(prepared.body).toEqual(expected);prepared.body.messages[0].content='replica mutation';
 expect(call.input.messages[0].content).toBe('Original mode prompt and exact registered tools');
});
it('rejects edited messages, missing identity, missing historical manifest and invalid mode limits',()=>{
 const {call}=fixture('quick',0);
 const changed=structuredClone(call);changed.input.messages[1].content='changed';changed.input_hash=digest(changed.input);
 expect(()=>prepareRecordedModeRequest(changed)).toThrow();
 const missing=structuredClone(call);missing.output.data.value.requestManifest.response.provider=null;
 expect(()=>prepareRecordedModeRequest(missing)).toThrow();
 expect(()=>prepareRecordedModeRequest({...call,output:{status:'success',data:{value:{}}}})).toThrow();
 const deadline=structuredClone(call);deadline.input.profile.firstOutputMs=1;deadline.input_hash=digest(deadline.input);
 expect(()=>prepareRecordedModeRequest(deadline)).toThrow();
});
it('does not silently upgrade legacy synchronous receipts to mode-equivalent ones',()=>{
 const {call}=fixture('quick',0);const config={model:call.input.profile.routes[0].model,providers:[]};
 const input={messages:call.input.messages,config};
 expect(()=>prepareRecordedModeRequest({input,input_hash:digest(input),output:{status:'success',data:call.output.data.value}})).toThrow();
});
