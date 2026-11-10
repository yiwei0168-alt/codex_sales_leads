import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {bindRuntime,userId,once,json,sha,id} from '../hybrid-evaluation-v1/runtime';
import {modeModelConfig} from '../../src/lib/assistant/main/mode-config';
import {requestModeModel} from '../../src/lib/assistant/main/model';
import {withProductSpend} from '../../src/lib/billing/context';
import {modelRoutedTransport} from '../../src/lib/network/model-transport';
import {failureDiagnostic} from '../../src/lib/network/failure-diagnostic';
const root='experiments/proxy-pool-validation-v2',local='.local-runtime/proxy-pool-validation-v2';
await mkdir(local,{recursive:true});await mkdir(`${root}/results`,{recursive:true});
const profile=modeModelConfig('deep').profile!,prompts=[1,2,3].map(n=>`Proxy pool validation v2 case ${n}. Reply exactly READY. No tools.`);
const sources:Record<string,string>={};
for(const path of [`${root}/run.ts`,`${root}/README.md`,'src/lib/network/model-transport.ts','src/lib/assistant/main/model.ts','src/lib/assistant/main/model-stream.ts'])sources[path]=sha(await readFile(path,'utf8'));
const manifest={profile,prompts,sources,proxyRequired:true,maximumRequests:3,consecutiveFailureStop:2},identity=sha(json(manifest));
if(process.argv[2]==='freeze'){await writeFile(`${local}/freeze.json`,json(manifest),{flag:'wx'});console.log('Frozen; no model calls.');}
else if(process.argv[2]==='run'){
 if(sha(await readFile(`${local}/freeze.json`,'utf8'))!==identity)throw Error('Source/config drift');
 const db=await bindRuntime(),rows=[];let consecutiveFailures=0;
 const url='https://openrouter.ai/api/v1/chat/completions';
 const routed=modelRoutedTransport(fetch,url,{method:'POST',body:JSON.stringify({model:profile.routes[0].model})});
 try{for(const [index,prompt] of prompts.entries()){
  if(consecutiveFailures>=2)break;
  const key=sha(`${identity}/${index}`),wire:unknown[]=[];
  const transport:typeof fetch=async(input,init)=>{const start=performance.now();try{const r=await routed(input,init);wire.push({status:r.status,headersMs:performance.now()-start});return r;}catch(error){wire.push({failure:failureDiagnostic(error)});throw error;}};
  const receipt=await once(`${local}/${index+1}.json`,key,()=>withProductSpend(userId,'proxy-pool-validation',()=>requestModeModel([{role:'user',content:prompt}],profile,0,transport),id(key)));
  const response=receipt.response as Awaited<ReturnType<typeof requestModeModel>>|undefined;
  const complete=receipt.status==='completed'&&response?.message.content?.trim()==='READY'&&typeof response?.usage?.cost==='number'&&Boolean(response.generationId);
  rows.push({case:index+1,status:receipt.status,complete,latencyMs:receipt.latencyMs,reply:response?.message.content??null,costUsd:response?.usage?.cost??null,generationId:response?.generationId??null,error:receipt.error??null,wire});
  consecutiveFailures=complete?0:consecutiveFailures+1;
  await writeFile(`${root}/results/progress.json`,json({identity,manifest,submitted:rows.length,passed:rows.length===3&&rows.every(r=>r.complete),rows,productionChanged:false,businessAcceptance:false}));
  console.log(json(rows.at(-1)));
 }}finally{await db.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
}else throw Error('Use freeze or run');

