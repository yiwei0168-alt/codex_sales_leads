import {Agent,fetch as localFetch} from 'undici';
import {replayStepSchema,SKILL_REPLAY_CONFIG,type ReplayMessage} from './skill-replay';

/** Separate direct dispatcher ignores shell proxy variables. Never calls a cloud fallback. */
export async function localReplayModel(endpoint:string,expectedDigest:string){
  const base=new URL(endpoint);
  if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
    throw new Error('Replay model must use HTTP loopback');
  const dispatcher=new Agent();
  const request=async(path:string,body?:unknown)=>{
    const response=await localFetch(new URL(path,base),{dispatcher,redirect:'error',signal:AbortSignal.timeout(body?SKILL_REPLAY_CONFIG.timeoutMs:3000),
      ...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error('Local replay model unavailable');
    const text=await response.text();if(text.length>1000000)throw new Error('Local replay response too large');
    return JSON.parse(text);
  };
  try{
    const tags=await request('/api/tags');
    if(!tags.models?.some((m:{name?:string;digest?:string})=>m.name==='qwen3:8b'&&m.digest===expectedDigest))throw new Error('Local replay model digest mismatch');
  }catch(error){await dispatcher.close();throw error;}
  return {close:()=>dispatcher.close(),generate:async(messages:ReplayMessage[])=>{
    const body=await request('/api/chat',{model:'qwen3:8b',stream:false,think:false,messages,
      options:SKILL_REPLAY_CONFIG.generation,format:SKILL_REPLAY_CONFIG.schema});
    if(body.model!=='qwen3:8b'||body.done!==true||body.done_reason==='length')throw new Error('Incomplete or wrong local model response');
    return replayStepSchema.parse(JSON.parse(body.message.content));
  }};
}
