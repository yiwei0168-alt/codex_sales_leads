import {readFile,writeFile,mkdir,open} from 'node:fs/promises';import {resolve,relative,isAbsolute} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
const execute=promisify(execFile);export const sha=data=>createHash('sha256').update(data).digest('hex');
export function within(root,path){const suffix=relative(resolve(root),resolve(path));return suffix!==''&&!suffix.startsWith('..')&&!isAbsolute(suffix);}
const normalize=value=>value.replaceAll('/','\\').toLowerCase();
export function commandHasPath(command,path){const text=normalize(command),needle=normalize(path);let at=text.indexOf(needle);while(at>=0){const before=text[at-1],after=text[at+needle.length];if((!before||/[\s"']/.test(before))&&(!after||/[\s"']/.test(after)))return true;at=text.indexOf(needle,at+1);}return false;}
export function ownsProcess(component,process){
 if(component.identityPaths.every(path=>commandHasPath(process.commandLine,path)))return true;
 return component.legacy?.some(legacy=>legacy.pid===process.pid&&legacy.createdAt===process.createdAt&&legacy.commandSha256===sha(process.commandLine))??false;
}
export function selectExisting(component,inventory){
 const matches=inventory.processes.filter(process=>ownsProcess(component,process));
 if(component.port){const listeners=inventory.listeners.filter(item=>item.port===component.port);if(listeners.some(item=>item.address!=='127.0.0.1'))throw Error(component.name+': non-loopback listener');
  const ids=[...new Set(listeners.map(item=>item.pid))];if(ids.length>1||ids.some(id=>!matches.some(process=>process.pid===id)))throw Error(component.name+': port belongs to an unrecognized process');
  if(ids.length===1)return matches.find(process=>process.pid===ids[0]);
  // Windows venv Python has a launcher and a child with the same script path.
  // Before binding, wait for them; after binding, adopt the listener's PID.
  return matches[0]??null;
 }
 if(matches.length>1)throw Error(component.name+': multiple matching processes');
 return matches[0]??null;
}
export async function ensureComponent(component,deps){
 const started=Date.now();let spawned=false;
 for(;;){const existing=selectExisting(component,await deps.inventory());if(existing&&(!component.health||await deps.healthy(component.health,component.healthExpected)))return {name:component.name,pid:existing.pid,adopted:!spawned};
  if(!existing){if(spawned)throw Error(component.name+': process exited during startup');await deps.start(component);spawned=true;}
  if(Date.now()-started>component.startupMs)throw Error(component.name+': startup deadline exceeded');await deps.wait(1500);
 }
}
export async function inventory(root){const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(root,'scripts/local-runtime-inventory.ps1'),'-WorkspaceRoot',root],{windowsHide:true,timeout:20_000,maxBuffer:1024*1024,encoding:'utf8'});return JSON.parse(stdout.replace(/^\uFEFF/,''));}
export async function healthy(url,expected){try{const response=await fetch(url,{signal:AbortSignal.timeout(4000)});if(!response.ok)return false;if(url.endsWith('/health')){const data=await response.json();return data.status==='ready'&&Object.entries(expected??{}).every(([key,value])=>data[key]===value);}return true;}catch{return false;}}
export async function validateConfig(config,root){
 if(config.protocol!=='local-acceptance-startup-v1'||resolve(config.workspace)!==root||!within(root,config.runtimeRoot))throw Error('Invalid local runtime scope');
 if(config.nodeVersion!==process.version||resolve(config.nodeExecutable)!==process.execPath)throw Error('Node runtime changed; reconfigure the acceptance entry');
 if((await readFile(resolve(config.runtimeRoot,config.distDir,'BUILD_ID'),'utf8')).trim()!==config.buildId)throw Error('Build ID mismatch');
 for(const [path,hash] of Object.entries(config.integrity)){if(!within(root,path)||sha(await readFile(path))!==hash)throw Error('Local runtime file mismatch: '+relative(root,path));}
 for(const filename of ['.env','.env.local','.env.production','.env.production.local']){try{await readFile(resolve(config.runtimeRoot,filename));throw Error('Runtime directory contains private environment file');}catch(error){if(error.code!=='ENOENT')throw error;}}
 if(config.components.map(component=>component.name).join(',')!=='bge,api,web,worker,mailbox')throw Error('Invalid component order');
 const allowedEnv=new Set(['PORT','HOSTNAME','BGE_M3_MODEL_PATH','BGE_M3_PORT','HF_HUB_OFFLINE','TRANSFORMERS_OFFLINE','HF_HUB_DISABLE_TELEMETRY','DO_NOT_TRACK','TOKENIZERS_PARALLELISM']);
 for(const component of config.components){if((resolve(component.cwd)!==root&&!within(root,component.cwd))||component.identityPaths.some(path=>!within(root,path))||Object.keys(component.env??{}).some(key=>!allowedEnv.has(key)))throw Error('Invalid component scope');if(component.health&&!/^http:\/\/127\.0\.0\.1:(3001|2024|8765)(\/|$)/.test(component.health))throw Error('Invalid health scope');if(component.executable!==config.nodeExecutable&&component.executable!==resolve(root,'.venv-bge-v3/Scripts/python.exe'))throw Error('Invalid runtime executable');}
}
export function filterRuntimeEnvironment(source,inherited){
 const keys=[...source.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map(match=>match[1]),env={};
 for(const key of ['SystemRoot','WINDIR','PATH','PATHEXT','COMSPEC','USERPROFILE','USERNAME','TEMP','TMP','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy',...keys])if(inherited[key]!==undefined)env[key]=inherited[key];
 for(const key of ['DATABASE_MIGRATION_URL','PAID_CALL_STAGE_OVERRIDE','PAID_CALL_STAGE_OVERRIDE_USER_ID','NODE_OPTIONS','LANGSMITH_API_KEY','LANGCHAIN_API_KEY'])delete env[key];
 Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',LANGSMITH_TRACING:'false',LANGCHAIN_TRACING_V2:'false',LANGGRAPH_API_URL:'http://127.0.0.1:2024',ENABLE_MAIN_AGENT_LOCAL_BGE_SEARCH:'1',BGE_M3_SERVICE_URL:'http://127.0.0.1:8765',NO_PROXY:[env.NO_PROXY,'127.0.0.1','localhost','::1'].filter(Boolean).join(',')});return env;
}
export async function runtimeEnvironment(root){const {default:nextEnv}=await import('@next/env');nextEnv.loadEnvConfig(root);return filterRuntimeEnvironment(await readFile(resolve(root,'.env.local'),'utf8'),process.env);}
export async function launch(component,root,env){
 const directory=resolve(root,'.local-runtime/logs');await mkdir(directory,{recursive:true});const stdout=await open(resolve(directory,component.name+'.stdout.log'),'a'),stderr=await open(resolve(directory,component.name+'.stderr.log'),'a');
 try{const child=spawn(component.executable,component.args,{cwd:component.cwd,env:{...env,...component.env},windowsHide:true,detached:true,stdio:['ignore',stdout.fd,stderr.fd]});await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});child.unref();return child.pid;}finally{await stdout.close();await stderr.close();}
}
export async function ensureDocker(config,root){
 if(config.docker.cliExecutable!=='C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe')throw Error('Unexpected Docker CLI path');
 const args=['--context',config.docker.context];let launched=false;const deadline=Date.now()+240_000;
 for(;;){try{const {stdout}=await execute(config.docker.cliExecutable,[...args,'info','--format','{{.OSType}}'],{windowsHide:true,timeout:15_000,maxBuffer:65536});if(stdout.trim()!=='linux')throw Error('Linux Docker engine required');break;}catch{
  if(!launched&&!(await inventory(root)).dockerDesktopRunning){if(config.docker.executable!=='C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe')throw Error('Unexpected Docker Desktop path');const child=spawn(config.docker.executable,[],{windowsHide:true,detached:true,stdio:'ignore'});await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});child.unref();launched=true;}
  if(Date.now()>deadline)throw Error('Docker Desktop did not become ready');await new Promise(done=>setTimeout(done,5000));
 }}
 for(const name of config.docker.containers){if(!/^codex_sales_leads-(postgres|neo4j|ollama)-1$/.test(name))throw Error('Unrecognized dependency container');const {stdout}=await execute(config.docker.cliExecutable,[...args,'inspect','--format','{{.State.Status}}',name],{windowsHide:true,timeout:15_000,maxBuffer:65536});if(stdout.trim()!=='running')await execute(config.docker.cliExecutable,[...args,'start',name],{windowsHide:true,timeout:30_000,maxBuffer:65536});}
}
export function nodePreloads(root){return ['--import',pathToFileURL(resolve(root,'scripts/langgraph-os-userinfo-preload.mjs')).href,'--import',pathToFileURL(resolve(root,'scripts/lib/local-runtime-network-preload.mjs')).href,'--import','tsx/esm'];}
export async function saveResult(root,result){await mkdir(resolve(root,'.local-runtime'),{recursive:true});await writeFile(resolve(root,'.local-runtime/last-start.json'),JSON.stringify(result,null,2)+'\n');}
