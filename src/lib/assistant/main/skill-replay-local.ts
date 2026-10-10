import {Agent,fetch as localFetch} from 'undici';
import {replayStepSchema,SKILL_REPLAY_CONFIG,type ReplayMessage} from './skill-replay';
import {modelReplySchema,modelFunctions} from './model';
import {digest,type ModelMessage} from './contracts';
import {z} from 'zod';

import {LocalReplayError,LOCAL_AGENT_REPLAY_TIMEOUT_MS} from './skill-replay-errors';
const nativeMessage=z.object({role:z.literal('assistant'),content:z.string().default(''),tool_calls:z.array(z.object({
  function:z.object({name:z.string().min(1).max(100),arguments:z.record(z.string(),z.unknown())})})).max(12).optional()});

export function localReplayFunctions(messages:ModelMessage[]){
  const describedCalls=new Set(messages.filter(m=>m.role==='assistant').flatMap(m=>(m.tool_calls??[])
    .filter(c=>c.function.name==='describe_tool').map(c=>c.id)));
  const hasDescription=messages.some(m=>{
    if(m.role!=='tool'||!describedCalls.has(m.tool_call_id??''))return false;
    try{return JSON.parse(m.content??'{}').status==='success';}catch{return false;}
  });
  // Advertise the existing protocol's prerequisite; do not synthesize a successful description.
  return modelFunctions.filter(t=>hasDescription||t.function.name!=='execute_tool');
}

/** Separate direct dispatcher ignores shell proxy variables. Never calls a cloud fallback. */
export async function localReplayModel(endpoint:string,expectedDigest:string){
  const base=new URL(endpoint);
  if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
    throw new Error('Replay model must use HTTP loopback');
  const dispatcher=new Agent();
  const request=async(path:string,body?:unknown,timeoutMs=body?SKILL_REPLAY_CONFIG.timeoutMs:3000)=>{
    const signal=AbortSignal.timeout(timeoutMs);
    try{
    const response=await localFetch(new URL(path,base),{dispatcher,redirect:'error',signal,
      ...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new LocalReplayError('local-http');
    const text=await response.text();if(text.length>1000000)throw new LocalReplayError('local-schema');
    try{return JSON.parse(text);}catch{throw new LocalReplayError('local-json');}
    }catch(error){if(error instanceof LocalReplayError)throw error;throw new LocalReplayError(signal.aborted?'local-timeout':'local-transport');}
  };
  try{
    const tags=await request('/api/tags');
    if(!tags.models?.some((m:{name?:string;digest?:string})=>m.name==='qwen3:8b'&&m.digest===expectedDigest))throw new Error('Local replay model digest mismatch');
  }catch(error){await dispatcher.close();throw error;}
  const generate=async(messages:unknown[],format:unknown)=>{
    const body=await request('/api/chat',{model:'qwen3:8b',stream:false,think:false,messages,
      options:SKILL_REPLAY_CONFIG.generation,format});
    if(body.model!=='qwen3:8b'||body.done!==true||body.done_reason==='length')throw new LocalReplayError('local-incomplete');
    return JSON.parse(body.message.content);
  };
  return {close:()=>dispatcher.close(),
    generate:async(messages:ReplayMessage[])=>replayStepSchema.parse(await generate(messages,SKILL_REPLAY_CONFIG.schema)),
    generateAgent:async(messages:ModelMessage[])=>{
      // Ollama stores argument objects and tool names in history; the product graph uses OpenAI-style JSON strings/IDs.
      const names=new Map(messages.flatMap(m=>(m.tool_calls??[]).map(c=>[c.id,c.function.name] as const)));
      const wire=messages.map(m=>({role:m.role,content:m.content??'',
        ...(m.tool_calls?{tool_calls:m.tool_calls.map(c=>({function:{name:c.function.name,arguments:JSON.parse(c.function.arguments)}}))}:{}),
        ...(m.role==='tool'?{tool_name:names.get(m.tool_call_id??'')??''}:{})}));
      const body=await request('/api/chat',{model:'qwen3:8b',stream:false,think:false,messages:wire,
        options:SKILL_REPLAY_CONFIG.generation,tools:localReplayFunctions(messages)},LOCAL_AGENT_REPLAY_TIMEOUT_MS);
      if(body.model!=='qwen3:8b'||body.done!==true||body.done_reason==='length')throw new LocalReplayError('local-incomplete');
      const parsed=nativeMessage.safeParse(body.message);if(!parsed.success)throw new LocalReplayError('local-schema');
      const message=parsed.data;
      return modelReplySchema.parse({role:'assistant',content:message.content,
        ...(message.tool_calls?.length?{tool_calls:message.tool_calls.map((call,index)=>({id:`local_${digest({messages,index,call}).slice(0,40)}`,
          type:'function',function:{name:call.function.name,arguments:JSON.stringify(call.function.arguments)}}))}:{})});
    }};
}
