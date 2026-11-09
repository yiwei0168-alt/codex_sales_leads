import {createServer} from 'node:http';
import {once} from 'node:events';
import {Agent,fetch as undiciFetch} from 'undici';
import {expect,it,vi} from 'vitest';
import {collectModelStream} from './model-stream';
const frame='data: {"id":"synthetic","model":"synthetic","choices":[{"index":0,"finish_reason":"stop","delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
it('reuses a real HTTP connection when EOF follows the SSE terminal marker',async()=>{
 const agent=new Agent({connections:1});let connections=0,aborted=0;
 const server=createServer((_request,response)=>{
  response.writeHead(200,{'content-type':'text/event-stream'});response.write(frame);
  response.on('close',()=>{if(!response.writableFinished)aborted++;});
  setTimeout(()=>response.end(),25);
 });
 server.on('connection',()=>connections++);server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('No local port');
  for(let i=0;i<3;i++){
   const response=await undiciFetch(`http://127.0.0.1:${address.port}`,{dispatcher:agent});
   const parsed=await collectModelStream(response as unknown as Response,new AbortController().signal,()=>{});
   expect((await parsed.json()).choices[0].message.content).toBe('ok');
  }
  expect(connections).toBe(1);expect(aborted).toBe(0);
 }finally{await agent.close();server.closeAllConnections();server.close();}
});
it('bounds draining after a complete answer and cancels a server that never closes',async()=>{
 const cancel=vi.fn(),stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(frame));},cancel});
 const started=performance.now();
 const answer=await collectModelStream(new Response(stream,{headers:{'content-type':'text/event-stream'}}),new AbortController().signal,()=>{});
 expect((await answer.json()).choices[0].message.content).toBe('ok');
 expect(cancel).toHaveBeenCalledOnce();expect(performance.now()-started).toBeLessThan(1500);
});
it('honors cancellation while draining instead of returning the completed answer',async()=>{
 const controller=new AbortController(),reason=new Error('cancelled'),cancel=vi.fn();
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(frame));},cancel});
 const timer=setTimeout(()=>controller.abort(reason),10);
 try{await expect(collectModelStream(new Response(stream,{headers:{'content-type':'text/event-stream'}}),controller.signal,()=>{})).rejects.toBe(reason);expect(cancel).toHaveBeenCalled();}
 finally{clearTimeout(timer);}
});
it('preserves a valid completed answer when only the optional transport drain fails',async()=>{
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(frame));setTimeout(()=>c.error(new TypeError('late socket reset')),10);}});
 const answer=await collectModelStream(new Response(stream,{headers:{'content-type':'text/event-stream'}}),new AbortController().signal,()=>{});
 expect((await answer.json()).choices[0].message.content).toBe('ok');
});
