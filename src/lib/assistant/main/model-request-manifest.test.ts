import {afterEach,expect,it,vi} from 'vitest';
import {modelRequestManifest,assertModelRequestManifest} from './model-request-manifest';
import {requestModeModel,requestModel} from './model';
import {modeModelConfig} from './mode-config';
import {auditModelProtocol} from './model-protocol-audit';
import {digest,type ModelMessage} from './contracts';
afterEach(()=>vi.unstubAllEnvs());
const body={model:'fixture/model',messages:[{role:'system',content:'private instruction'},{role:'user',content:'private mail body'}],tools:[{function:{name:'read'}}],max_tokens:16,provider:{data_collection:'deny'}};
it('binds settings, private inputs and tool schemas without duplicating plaintext',()=>{
 const m=modelRequestManifest(body,{model:'fixture/model',provider:'fixture',id:'generation'});
 expect(assertModelRequestManifest(body,m)).toEqual(m);expect(m.requestHash).toBe(digest(body));
 expect(JSON.stringify(m)).not.toContain('private instruction');expect(JSON.stringify(m)).not.toContain('private mail body');
 for(const changed of [{...body,max_tokens:32},{...body,messages:[]},{...body,tools:[]},{...body,provider:{data_collection:'allow'}}])expect(()=>assertModelRequestManifest(changed,m)).toThrow('mismatch');
 expect(()=>assertModelRequestManifest(body,{...m,settingsHash:'0'.repeat(64)})).toThrow();
 expect(()=>assertModelRequestManifest(body,{...m,response:{...m.response,modelMatchesRequested:false}})).toThrow();
});
it('preserves unknown response identity instead of inventing provider confirmation',()=>{
 const m=modelRequestManifest(body,{});expect(m.response).toEqual({model:null,provider:null,generationId:null,modelMatchesRequested:false});
});
it('binds the actual wire request even when caller-owned messages change while waiting',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture-key');
 const messages:ModelMessage[]=[{role:'user',content:'private original'}];let wire:Record<string,unknown>={};
 const response=await requestModel(messages,{model:'z-ai/glm-5.3',providers:['fireworks'],version:'fixture'},async(_url,init)=>{
  wire=JSON.parse(String(init?.body));messages[0].content='changed after transport';
  return Response.json({model:'z-ai/glm-5.3',provider:'fixture',id:'generation',choices:[{finish_reason:'stop',message:{role:'assistant',content:'OK'}}]});
 });
 expect(response.requestManifest.requestHash).toBe(digest(wire));expect(assertModelRequestManifest(wire,response.requestManifest)).toEqual(response.requestManifest);
 expect(JSON.stringify(response.requestManifest)).not.toContain('fixture-key');expect(response.requestManifest.response.modelMatchesRequested).toBe(true);
});
it('returns a manifest for each selected mode route using its native streaming body',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','fixture-key');const profile=modeModelConfig('quick').profile!;
 for(const index of [0,1,2]){
  let wire:Record<string,unknown>={};
  const response=await requestModeModel([{role:'user',content:'Synthetic'}],profile,index,async(_url,init)=>{
   wire=JSON.parse(String(init?.body));
   const frame={id:`generation-${index}`,model:profile.routes[index].model,provider:'fixture',choices:[{index:0,finish_reason:'stop',delta:{content:'OK'}}]};
   return new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
  });
  expect(response.requestManifest.requestHash).toBe(digest(wire));expect(response.requestManifest.requestedModel).toBe(profile.routes[index].model);
  expect(response.requestManifest.settings).toMatchObject({stream:true,reasoning:{effort:profile.routes[index].effort}});
  expect(response.requestManifest.response).toMatchObject({generationId:`generation-${index}`,modelMatchesRequested:true});
  const input={messages:[{role:'user',content:'Synthetic'}],profile,index};const output={status:'success',data:{value:response}};
  expect(auditModelProtocol({input,input_hash:digest(input),output})).toMatchObject({bound:true,qualityAccepted:false});
  expect(auditModelProtocol({input,input_hash:'0'.repeat(64),output})).toMatchObject({bound:false,reason:'journal-input-changed'});
  const changed={...input,index:(index+1)%3};expect(auditModelProtocol({input:changed,input_hash:digest(changed),output})).toMatchObject({bound:false});
  expect(auditModelProtocol({input,input_hash:digest(input),output:{status:'unavailable',data:null}})).toMatchObject({bound:false,reason:'model-attempt-not-successful'});
  const historical={status:'success',data:{value:{message:response.message}}};expect(auditModelProtocol({input,input_hash:digest(input),output:historical})).toMatchObject({bound:false,reason:'historical-wire-manifest-missing'});
 }
});
