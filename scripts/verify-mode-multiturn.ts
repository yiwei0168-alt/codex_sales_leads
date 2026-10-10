import nextEnv from '@next/env';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { modeModelConfig, type ModeConfig } from '../src/lib/assistant/main/mode-config';
import { requestModeModel } from '../src/lib/assistant/main/model';
import type { ModelMessage } from '../src/lib/assistant/main/contracts';
import { modelRoutedTransport } from '../src/lib/network/model-transport';
import { modeFailureCode } from '../src/lib/assistant/main/mode-fallback';

nextEnv.loadEnvConfig(process.cwd());
if(process.env.MODESEL14_SYNTHETIC_AUTHORIZED!=='1')throw new Error('MODESEL-14 explicit authorization required');
const path='docs/evidence/mode-multiturn-2026-10-10.json';
type Receipt={model:string;mode:string;effort:string;round:number;status:string;startedAt:string;elapsedMs?:number;provider?:string|null;generationId?:string|null;usage?:unknown;error?:string;httpStatus?:number;tool?:string};
type Report={rule:string;maxRequests:number;maxOutputTokens:number;privateData:false;realToolExecutions:0;attempts:Receipt[]};
let report:Report;
try {report=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;report={rule:'MODESEL-14',maxRequests:16,maxOutputTokens:1024,privateData:false,realToolExecutions:0,attempts:[]};}
await mkdir('docs/evidence',{recursive:true});
const persist=()=>writeFile(path,JSON.stringify(report,null,2)+'\n');
// Select the stronger Sol slot; the standard low-effort slot is not re-probed.
const configs=new Map<string,{profile:ModeConfig;index:number}>();
for(const mode of ['quick','standard','deep'] as const){const profile=modeModelConfig(mode).profile!;profile.routes.forEach((r,index)=>configs.set(r.model,{profile,index}));}
for(const [model,{profile,index}] of configs){
  if(report.attempts.some(r=>r.model===model)){console.log(JSON.stringify({model,status:'already-attempted-no-replay'}));continue;}
  const messages:ModelMessage[]=[{role:'system',content:'Synthetic integration check. First call describe_tool with tool knowledge_search, exactly once. After its simulated tool result, return exactly FIXTURE_OK with no further tool calls. Do not access any real data.'},{role:'user',content:'Perform the synthetic two-turn check.'}];
  for(let round=1;round<=2;round++){
    if(report.attempts.length>=16)throw new Error('Authorized request count exhausted');
    const row:Receipt={model,mode:profile.mode,effort:profile.routes[index].effort,round,status:'started',startedAt:new Date().toISOString()};
    report.attempts.push(row);await persist();const started=Date.now();let sent=false;
    // Exercise the production stream parser and deadlines; only reduce the wire output bound.
    const transport:typeof fetch=async(input,init)=>{
      if(sent)throw new Error('No retry permitted');sent=true;
      const body=JSON.parse(String(init?.body));
      if(body.model!==model||body.stream!==true||body.provider.allow_fallbacks!==false)throw new Error('Unexpected route');
      const bounded={...init,body:JSON.stringify({...body,max_tokens:1024})};
      const response=await modelRoutedTransport(fetch,input,bounded)(input,bounded);row.httpStatus=response.status;return response;
    };
    try{
      const response=await requestModeModel(messages,profile,index,transport);
      Object.assign(row,{provider:response.provider,generationId:response.generationId,usage:response.usage});
      if(round===1){
        const calls=response.message.tool_calls;
        if(calls?.length!==1||calls[0].function.name!=='describe_tool'||JSON.parse(calls[0].function.arguments).tool!=='knowledge_search')throw new Error('Synthetic tool contract mismatch');
        row.tool=calls[0].function.name;
        messages.push(response.message,{role:'tool',tool_call_id:calls[0].id,content:JSON.stringify({status:'success',data:{fixture:true,tool:'knowledge_search',instruction:'Synthetic result. Reply FIXTURE_OK now.'}})});
      }else if(response.message.tool_calls?.length||response.message.content?.trim()!=='FIXTURE_OK')throw new Error('Synthetic final answer mismatch');
      row.status='passed';
    }catch(error){row.status='failed';row.error=modeFailureCode(error);}
    row.elapsedMs=Date.now()-started;await persist();console.log(JSON.stringify(row));
    if(row.status!=='passed')break;
  }
}
console.log(JSON.stringify({attempts:report.attempts.length,passed:report.attempts.filter(r=>r.status==='passed').length,completeModels:[...configs.keys()].filter(model=>report.attempts.some(r=>r.model===model&&r.round===2&&r.status==='passed')).length}));
