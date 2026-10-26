import assert from 'node:assert/strict';import {createServer} from 'node:net';import {spawn} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {build} from 'esbuild';import {productNodeBuildOptions} from './lib/product-node-build.mjs';
const directory=resolve('tmp/main-worker-poll-failure');await mkdir(directory,{recursive:true});const file=directory+'/worker.mjs';
await build({...productNodeBuildOptions(),entryPoints:['scripts/run-main-agent-worker.ts'],outfile:file});
const listener=createServer();await new Promise(done=>listener.listen(0,'127.0.0.1',done));const address=listener.address();assert(address&&typeof address!=='string');const port=address.port;await new Promise(done=>listener.close(done));
const env={};for(const key of ['SystemRoot','WINDIR','PATH','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE'])if(process.env[key]!==undefined)env[key]=process.env[key];
Object.assign(env,{NODE_ENV:'production',DATABASE_URL:`postgresql://synthetic:synthetic@127.0.0.1:${port}/unavailable`,LANGGRAPH_API_URL:'http://127.0.0.1:1',LANGSMITH_TRACING:'false',LANGCHAIN_TRACING_V2:'false'});
async function run(once){
 let output='',failure='',settled=false;const child=spawn(process.execPath,[file,...(once?['--once']:[])],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const exit=new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>{settled=true;done(code);});});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>failure+=b);
 const timeout=setTimeout(()=>child.kill(),25_000);
 try{if(once){const code=await exit;assert.notEqual(code,0);assert(!failure.includes('mainAgentPolling'));return {diagnosticFailedVisibly:true};}
  const deadline=Date.now()+20_000;let records=[];
  while(Date.now()<deadline&&!settled){records=failure.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}).filter(item=>item.mainAgentPolling==='retrying');if(records.length>=2)break;await new Promise(done=>setTimeout(done,100));}
  assert(!settled,'Continuous worker exited instead of waiting');assert(records.length>=2,'No repeated bounded retry observed');assert.deepEqual(records.slice(0,2).map(r=>r.retryAfterMs),[2000,4000]);assert(records.every(r=>r.reason==='ECONNREFUSED'));return {continuousProcessSurvived:true,retries:records.length,boundedBackoff:true};
 }finally{clearTimeout(timeout);if(!settled)child.kill();await exit;}
}
const continuous=await run(false),single=await run(true);const result={...continuous,...single,isolatedUnavailableDatabase:true,actualWorkerEntry:true,businessDatabaseAccess:false,modelRequests:0};await writeFile(directory+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
