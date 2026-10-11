import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {Agent,fetch} from 'undici';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';
import {localReplayFunctions} from '../src/lib/assistant/main/skill-replay-local';
import type {ModelMessage} from '../src/lib/assistant/main/contracts';
disableLocalAnalysisTracing();
const dispatcher=new Agent(),base='http://127.0.0.1:11434';
const directory=`tmp/skill-thinking-probe/${randomUUID()}`;await mkdir(directory,{recursive:true});
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const settings={model:'qwen3:8b',think:true,stream:false,options:{temperature:0,seed:42,num_predict:2048,num_ctx:32768}};
try{
 const tags=await (await fetch(`${base}/api/tags`,{dispatcher,redirect:'error',signal:AbortSignal.timeout(3000)})).json() as {models:Array<{name:string;digest:string}>};
 if(!tags.models.some(m=>m.name==='qwen3:8b'&&m.digest==='500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41'))throw Error('model mismatch');
 await writeFile(`${directory}/manifest.json`,JSON.stringify({settings,maximumCalls:4,timeoutMs:120000,source:'exposed synthetic failed trial',fullReplay:false,qualityAccepted:false,cloud:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({directory,status:'started'}));
 for(const file of ['001.json','004.json']){
  const raw=await readFile(`tmp/skill-replay/c8a4e4a5-9a10-4ef5-9439-8d9f87d4ff65/${file}`,'utf8');
  const pair=JSON.parse(raw);
  for(const arm of ['baseline','candidate']){
   const original=pair[arm].messages as ModelMessage[];
   // Probe exactly the first decision for ambiguity, and the answer after the injected receipt.
   const end=file==='001.json'?original.findIndex(m=>m.role==='assistant'):original.length-1;
   const messages=original.slice(0,end),names=new Map(messages.flatMap(m=>(m.tool_calls??[]).map(c=>[c.id,c.function.name])));
   const wire=messages.map(m=>({role:m.role,content:m.content??'',...(m.tool_calls?{tool_calls:m.tool_calls.map(c=>({function:{name:c.function.name,arguments:JSON.parse(c.function.arguments)}}))}:{}),...(m.role==='tool'?{tool_name:names.get(m.tool_call_id??'')??''}:{})}));
   const body=JSON.stringify({...settings,messages:wire,tools:localReplayFunctions(messages)});const start=Date.now();
   console.log(JSON.stringify({case:pair.caseId,arm,status:'requesting'}));
   let output:unknown;
   try{const response=await fetch(`${base}/api/chat`,{dispatcher,redirect:'error',method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error(`http-${response.status}`);output=await response.json();
   }catch(error){output={error:error instanceof Error?error.name:'request-failed'};}
   await writeFile(`${directory}/${file.slice(0,3)}-${arm}.json`,JSON.stringify({sourceSha256:digest(raw),requestSha256:digest(body),messages,settings,output,elapsedMs:Date.now()-start},null,2),{flag:'wx'});
   console.log(JSON.stringify({case:pair.caseId,arm,status:'saved',elapsedMs:Date.now()-start}));
  }
 }
}finally{await dispatcher.close();}
