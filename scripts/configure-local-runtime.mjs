import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {build} from 'esbuild';import {productNodeBuildOptions} from './lib/product-node-build.mjs';
import {sha,within,inventory,nodePreloads,validateConfig,ownsProcess,commandHasPath} from './lib/local-runtime.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));process.chdir(root);if(process.argv.length!==3)throw Error('Provide the verified cutover evidence path');
const evidencePath=resolve(root,process.argv[2]);if(!within(root,evidencePath))throw Error('Evidence must be in this workspace');const evidence=JSON.parse(await readFile(evidencePath,'utf8'));
const runtimeRoot=resolve(evidence.records.web.root),distDir='.next-pollrecovery-405ec008';if(!within(root,runtimeRoot)||evidence.productCommit!=='405ec008')throw Error('Unsupported verified local runtime');
const local=resolve(root,'.local-runtime');await mkdir(resolve(local,'artifacts'),{recursive:true});const candidate=resolve(local,'mailbox-worker.build.mjs');
await build({...productNodeBuildOptions(),entryPoints:[resolve(root,'scripts/run-mailbox-worker.ts')],outfile:candidate});
const mailbox=resolve(local,'artifacts/mailbox-'+sha(await readFile(candidate))+'.mjs');await copyFile(candidate,mailbox);
const state=await inventory(root),preload=nodePreloads(root),apiEntry=resolve(root,'scripts/start-local-business-api.mjs'),webEntry=resolve(root,'scripts/start-ma24-pilot-web.mjs'),bgeEntry=resolve(root,'scripts/bge_m3_service.py');
const component=(name,entry,args,extra={})=>({name,executable:process.execPath,args,cwd:runtimeRoot,identityPaths:[entry],startupMs:90_000,...extra});
const components=[
 component('bge',bgeEntry,['-u',bgeEntry],{executable:resolve(root,'.venv-bge-v3/Scripts/python.exe'),cwd:root,port:8765,health:'http://127.0.0.1:8765/health',healthExpected:{model:'BAAI/bge-m3',revision:'5617a9f61b028005a4858fdac845db406aefb181',dimensions:1024},startupMs:240_000,env:{BGE_M3_MODEL_PATH:resolve(root,'.models/bge-m3/5617a9f61b028005a4858fdac845db406aefb181'),BGE_M3_PORT:'8765',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',DO_NOT_TRACK:'1',TOKENIZERS_PARALLELISM:'false'}}),
 component('api',apiEntry,[...preload,apiEntry,runtimeRoot],{identityPaths:[apiEntry,runtimeRoot],port:2024,health:'http://127.0.0.1:2024/ok'}),
 component('web',webEntry,['--require',resolve(runtimeRoot,'.skill-runtime-source/scripts/patch-node-user.cjs'),webEntry,runtimeRoot],{identityPaths:[webEntry,runtimeRoot],port:3001,health:'http://127.0.0.1:3001/api/auth/session',env:{PORT:'3001',HOSTNAME:'127.0.0.1'}}),
 component('worker',resolve(runtimeRoot,'business-worker.mjs'),[...preload,resolve(runtimeRoot,'business-worker.mjs')]),
 component('mailbox',mailbox,[...preload,mailbox]),
];
// Existing temporary API/mail workers are adopted only by exact PID, birth and
// command hash; a reused PID after reboot cannot satisfy this legacy binding.
for(const component of components){let candidates=[];if(component.port){const ids=state.listeners.filter(item=>item.port===component.port&&item.address==='127.0.0.1').map(item=>item.pid);candidates=state.processes.filter(item=>ids.includes(item.pid));}else if(component.name==='mailbox')candidates=state.processes.filter(item=>item.commandLine.includes('mailbox-worker.mjs'));
 const legacy=[];for(const item of candidates){if(ownsProcess(component,item))continue;
  if(component.name==='api'&&commandHasPath(item.commandLine,resolve(root,'tmp/ma24-local-qa-api.mjs')))legacy.push(item);
  else if(component.name==='mailbox'&&commandHasPath(item.commandLine,resolve(root,'.next-releases/local-accepted-6dded268-native/mailbox-worker.mjs')))legacy.push({...item,artifactSha256:sha(await readFile(resolve(root,'.next-releases/local-accepted-6dded268-native/mailbox-worker.mjs'))),sourceCommit:'6dded268'});
  else throw Error('Unrecognized existing '+component.name+' process');}
 component.legacy=legacy.map(item=>({pid:item.pid,createdAt:item.createdAt,commandSha256:sha(item.commandLine),...(item.artifactSha256?{artifactSha256:item.artifactSha256,sourceCommit:item.sourceCommit}:{})}));}
const integrity={};for(const name of ['business-main-server','business-worker','business-legacy-server']){const path=resolve(runtimeRoot,name+'.mjs'),hash=sha(await readFile(path));if(hash!==evidence.artifacts.artifacts[name])throw Error('Verified runtime bytes changed');integrity[path]=hash;}
for(const path of [mailbox,resolve(runtimeRoot,'server.js'),apiEntry,webEntry,bgeEntry,resolve(root,'scripts/start-local-runtime.mjs'),resolve(root,'scripts/local-runtime-inventory.ps1'),resolve(root,'scripts/run-local-runtime-task.ps1'),resolve(root,'scripts/lib/local-runtime.mjs'),resolve(root,'scripts/lib/local-runtime-network-preload.mjs'),resolve(root,'scripts/lib/main-runtime-durable-persistence.mjs'),resolve(root,'scripts/langgraph-os-userinfo-preload.mjs')])integrity[path]=sha(await readFile(path));
const config={protocol:'local-acceptance-startup-v1',workspace:root,runtimeRoot,distDir,productCommit:evidence.productCommit,buildId:evidence.buildId,nodeExecutable:process.execPath,nodeVersion:process.version,integrity,components,docker:{context:'desktop-linux',cliExecutable:'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',executable:'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',containers:['codex_sales_leads-postgres-1','codex_sales_leads-neo4j-1','codex_sales_leads-ollama-1']}};
await validateConfig(config,root);await writeFile(resolve(local,'config.json'),JSON.stringify(config,null,2)+'\n');console.log(JSON.stringify({configured:true,buildId:config.buildId,components:components.map(item=>item.name),secretsStored:false}));
