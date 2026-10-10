import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({fetch:vi.fn(),close:vi.fn(async()=>{})}));
vi.mock('undici',()=>({Agent:class{close=mock.close;},fetch:mock.fetch}));
import {localReplayModel} from './skill-replay-local';
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
  mock.fetch.mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({model:'qwen3:8b',done:true,done_reason:'stop',message:{content:'{"role":"assistant","content":"Done"}'}})});
  const local=await localReplayModel('http://127.0.0.1:11434','a'.repeat(64));
  await local.generateAgent([{role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name:'execute_tool',arguments:'{"tool":"knowledge_search","arguments":{"question":"ports"}}'}}]},
    {role:'tool',tool_call_id:'call',content:'{"status":"success"}'}]);
  const wire=JSON.parse(mock.fetch.mock.calls.at(-1)![1].body).messages;
  expect(wire[0].tool_calls[0].function.arguments.tool).toBe('knowledge_search');expect(wire[1].tool_name).toBe('execute_tool');
  await local.close();
});
