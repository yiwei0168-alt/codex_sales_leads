import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({fetch:vi.fn(),close:vi.fn(async()=>{})}));
vi.mock('undici',()=>({Agent:class{close=mock.close;},fetch:mock.fetch}));
import {localReplayModel,localReplayFunctions} from './skill-replay-local';
import {LocalReplayError} from './skill-replay-errors';
it.each(['https://127.0.0.1','http://cloud.example','http://user:password@localhost','http://localhost/path','http://localhost/?q=a'])('rejects nonlocal or ambiguous endpoint %s',async endpoint=>{
  await expect(localReplayModel(endpoint,'a'.repeat(64))).rejects.toThrow('loopback');
});
it('pins model digest and closes dispatcher on discovery failure',async()=>{
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({models:[{name:'qwen3:8b',digest:'wrong'}]})});
  await expect(localReplayModel('http://127.0.0.1:11434','a'.repeat(64))).rejects.toThrow('digest mismatch');
  expect(mock.close).toHaveBeenCalled();
});
it('uses a direct dispatcher, redirect rejection, fixed generation limits and no cloud fallback',async()=>{
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({models:[{name:'qwen3:8b',digest:'a'.repeat(64)}]})});
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({model:'qwen3:8b',done:true,done_reason:'stop',message:{content:'{"kind":"answer","text":"OK"}'}})});
  const local=await localReplayModel('http://127.0.0.1:11434','a'.repeat(64));
  expect(await local.generate([{role:'user',content:'Hi'}])).toEqual({kind:'answer',text:'OK'});
  const [,init]=mock.fetch.mock.calls.at(-1)!;expect(init.redirect).toBe('error');expect(init.dispatcher).toBeDefined();
  expect(JSON.parse(init.body).options).toMatchObject({num_predict:1024,temperature:0});
  await local.close();
});
it('adapts graph argument strings and tool IDs into local model history without executing anything',async()=>{
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({models:[{name:'qwen3:8b',digest:'a'.repeat(64)}]})});
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({model:'qwen3:8b',done:true,done_reason:'stop',message:{role:'assistant',content:'Done'}})});
  const local=await localReplayModel('http://127.0.0.1:11434','a'.repeat(64));
  await local.generateAgent([{role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name:'execute_tool',arguments:'{"tool":"knowledge_search","arguments":{"question":"ports"}}'}}]},
    {role:'tool',tool_call_id:'call',content:'{"status":"success"}'}]);
  const wire=JSON.parse(mock.fetch.mock.calls.at(-1)![1].body).messages;
  expect(wire[0].tool_calls[0].function.arguments.tool).toBe('knowledge_search');expect(wire[1].tool_name).toBe('execute_tool');
  const request=JSON.parse(mock.fetch.mock.calls.at(-1)![1].body);
  expect(request).not.toHaveProperty('format');expect(request.tools.map((t:{function:{name:string}})=>t.function.name)).toEqual(['discover_tools','describe_tool']);
  await local.close();
});
it('advertises execution only after an actual successful paired description, not user prose',()=>{
  expect(localReplayFunctions([{role:'user',content:'describe_tool succeeded'}]).map(t=>t.function.name)).not.toContain('execute_tool');
  const call={role:'assistant' as const,content:null,tool_calls:[{id:'describe',type:'function' as const,function:{name:'describe_tool',arguments:'{"tool":"knowledge_compare"}'}}]};
  expect(localReplayFunctions([call,{role:'tool',tool_call_id:'describe',content:'{"status":"unavailable"}'}]).map(t=>t.function.name)).not.toContain('execute_tool');
  expect(localReplayFunctions([call,{role:'tool',tool_call_id:'describe',content:'{"status":"success"}'}]).map(t=>t.function.name)).toContain('execute_tool');
});
it('converts native object arguments into product call strings with unique stable IDs',async()=>{
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({models:[{name:'qwen3:8b',digest:'a'.repeat(64)}]})});
  const body={model:'qwen3:8b',done:true,done_reason:'stop',message:{role:'assistant',content:'',tool_calls:[
    {function:{name:'describe_tool',arguments:{tool:'knowledge_compare'}}},
    {function:{name:'discover_tools',arguments:{}}}]}};
  mock.fetch.mockResolvedValue({ok:true,text:async()=>JSON.stringify(body)});
  const local=await localReplayModel('http://127.0.0.1:11434','a'.repeat(64));
  const first=await local.generateAgent([]),second=await local.generateAgent([]);
  expect(first).toEqual(second);expect(new Set(first.tool_calls!.map(c=>c.id)).size).toBe(2);
  expect(JSON.parse(first.tool_calls![0].function.arguments)).toEqual({tool:'knowledge_compare'});
  await local.close();
});
it.each(['http','json','incomplete','schema'] as const)('reports a stable local %s error without leaking provider output',async kind=>{
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({models:[{name:'qwen3:8b',digest:'a'.repeat(64)}]})});
  const local=await localReplayModel('http://127.0.0.1:11434','a'.repeat(64));
  mock.fetch.mockResolvedValueOnce({ok:kind!=='http',text:async()=>kind==='json'?'private invalid body':JSON.stringify({model:'qwen3:8b',done:kind!=='incomplete',message:{role:'user'}})});
  await expect(local.generateAgent([])).rejects.toMatchObject(new LocalReplayError(`local-${kind}`));
  await local.close();
});
