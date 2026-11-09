import {expect,it} from 'vitest';
import {collectModelStream} from './model-stream';
import {incompleteStreamReceipt} from './model-stream-receipt';
const frame=(data:unknown)=>`data: ${JSON.stringify(data)}\n\n`;
const base={id:'gen-test-123',model:'openai/gpt-6-luna',provider:'OpenAI'};
async function failure(text:string){
 try{await collectModelStream(new Response(text,{headers:{'content-type':'text/event-stream'}}),new AbortController().signal,()=>{});}
 catch(error){return error;}
 throw Error('Expected incomplete stream');
}
it('retains bounded identity, never partial content, arguments, reasoning or cost',async()=>{
 const error=await failure(frame({...base,usage:{cost:99,prompt_tokens:100},choices:[{delta:{content:'private',reasoning:'secret',tool_calls:[{index:0,id:'call',function:{name:'execute_tool',arguments:'private args'}}]},finish_reason:null}]}));
 expect(incompleteStreamReceipt(error)).toEqual({version:'incomplete-model-stream-v1',generationId:base.id,reportedModel:base.model,finishReason:null,doneMarker:false});
 expect(JSON.stringify(incompleteStreamReceipt(error))).not.toMatch(/private|secret|cost|tokens/);
});
it.each(['id','model','provider'])('discards metadata when %s changes midstream',async key=>{
 const error=await failure(frame({...base,choices:[]})+frame({...base,[key]:'changed',choices:[]}));
 expect(incompleteStreamReceipt(error)).toBeUndefined();
});
it.each(['../private','gen-'+ 'a'.repeat(129),''])('does not retain an invalid generation ID %s',async id=>{
 expect(incompleteStreamReceipt(await failure(frame({...base,id,choices:[]})))).toBeUndefined();
});
it('does not make a receipt for an arbitrary error-shaped object',()=>{
 expect(incompleteStreamReceipt({generationId:base.id,reportedModel:base.model})).toBeUndefined();
});
it('preserves the original socket failure identity and metadata without releasing partial tool output',async()=>{
 const error=new TypeError('socket gone');let reads=0;
 const stream=new ReadableStream<Uint8Array>({pull(c){if(reads++===0)c.enqueue(new TextEncoder().encode(frame({...base,choices:[]})));else c.error(error);}});
 await expect(collectModelStream(new Response(stream,{headers:{'content-type':'text/event-stream'}}),new AbortController().signal,()=>{})).rejects.toBe(error);
 expect(incompleteStreamReceipt(error)?.generationId).toBe(base.id);
});
