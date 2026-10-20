import {readFile,mkdir,open,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {collectorPackageInventory,assertCollectorRuntimeBoundary} from './package-integrity.mjs';

let phase='startup';
try{
 if(process.execArgv.length||process.env.NODE_OPTIONS?.trim()||process.env.NODE_PATH?.trim())throw new Error('Plain Node process required');
 const args=process.argv.slice(2),mode=args[0];
 const workerMode=mode==='worker'||mode==='mailbox-worker';
 if(!['--verify','server','worker','mailbox-worker'].includes(mode)||args.length>(workerMode?2:1)||(args.length===2&&args[1]!=='--once'))throw new Error('Expected server, worker/mailbox-worker [--once], or --verify');
 phase='package-integrity';const boundary=await assertCollectorRuntimeBoundary('/app');
 const expected=await readFile('/app/runtime-manifest.json','utf8'),actual=await collectorPackageInventory('/app');
 if(JSON.stringify(actual)!==expected)throw new Error('Runtime package differs from manifest');
 const build=JSON.parse(await readFile('/app/build-manifest.json','utf8'));
 if(build.protocol!=='main-agent-runtime-build-v1'||build.moduleFormat!=='esm'
  ||['worker','mailbox-worker','server'].some(name=>build.artifacts?.[name]?.sha256!==actual.files[`${name}.mjs`]?.sha256))
  throw new Error('Main runtime ESM build binding unavailable');
 const deploymentHash=createHash('sha256').update(JSON.stringify(actual)).digest('hex');
 const signingSettings=['TASK_MODEL_TRANSPORT_KEY_ID','TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE','TASK_MODEL_TRANSPORT_COLLECTOR_ID','TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256'];
 const signingConfigured=signingSettings.some(key=>Boolean(process.env[key]?.trim()));
 phase='task-transport-package-binding';
 if(signingConfigured&&(!/^[a-f0-9]{64}$/.test(process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256??'')
  ||process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256!==deploymentHash
  ||mode!=='--verify'&&signingSettings.some(key=>!process.env[key]?.trim())))throw new Error('Task transport package enrollment unavailable');
 const taskBinding={taskTransportPackageBindingRequired:signingConfigured,taskTransportPackageBindingVerified:signingConfigured};
 if(mode==='--verify'){
  console.log(JSON.stringify({mainAgentRuntimeIntegrity:'passed',files:Object.keys(actual.files).length,deploymentHash,runtimeModuleFormat:'esm',...taskBinding,...boundary,productionQualified:false}));
 }else{
  phase='database-configuration';
  if(process.env.NODE_ENV!=='production'||!process.env.DATABASE_URL||process.env.DATABASE_MIGRATION_URL)throw new Error('Restricted application database connection required');
  if(workerMode){phase=mode;await import(mode==='mailbox-worker'?'./mailbox-worker.mjs':'./worker.mjs');}
  else{
   // The API's outer run/store files live outside the immutable package. Inner
   // business checkpoints and authoritative task receipts remain in PostgreSQL.
   await mkdir('/runtime',{recursive:true});
   phase='state-directory';const probe=`/runtime/.main-agent-write-check-${randomUUID()}`;
   const descriptor=await open(probe,'wx',0o600);await descriptor.close();await unlink(probe);
   phase='durable-api-state';
   const require=createRequire(import.meta.url),serverUrl=pathToFileURL(require.resolve('@langchain/langgraph-api/server'));
   const persistenceUrl=new URL('./storage/persist.mjs',serverUrl);
   if(createHash('sha256').update(await readFile(persistenceUrl)).digest('hex')!=='127d8a480f67026a95197e424ba9c6669da0856ac19bd4c2a29746851251e21a')throw new Error('Unsupported API persistence implementation');
   const {installDurablePersistence}=await import('./durable-persistence.mjs');
   installDurablePersistence(await import(persistenceUrl.href));
   phase='api';const {startServer}=await import('@langchain/langgraph-api/server');
   const runtime=await startServer({host:'127.0.0.1',port:2024,nWorkers:1,cwd:'/runtime',graphs:{main_agent_workflow:'/app/server.mjs:mainAgentWorkflowGraph'}});
   let closing=false;
   const close=async()=>{if(closing)return;closing=true;await runtime.cleanup();await globalThis.__networkCopilotPool?.end();process.exit(0);};
   process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
   console.log(JSON.stringify({mainAgentApi:'ready',listener:'127.0.0.1:2024',deploymentHash,...taskBinding,productionQualified:false}));
  }
 }
}catch(error){console.error(JSON.stringify({mainAgentRuntime:'failed',phase,code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(error.code)?error.code:'unavailable'}));process.exitCode=1;}
