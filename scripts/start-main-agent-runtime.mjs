import {readFile,mkdir,open,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {collectorPackageInventory,assertCollectorRuntimeBoundary} from './package-integrity.mjs';

let phase='startup';
try{
 if(process.execArgv.length||process.env.NODE_OPTIONS?.trim()||process.env.NODE_PATH?.trim())throw new Error('Plain Node process required');
 const args=process.argv.slice(2),mode=args[0];
 if(!['--verify','server','worker'].includes(mode)||args.length>(mode==='worker'?2:1)||(args.length===2&&args[1]!=='--once'))throw new Error('Expected server, worker [--once], or --verify');
 phase='package-integrity';const boundary=await assertCollectorRuntimeBoundary('/app');
 const expected=await readFile('/app/runtime-manifest.json','utf8'),actual=await collectorPackageInventory('/app');
 if(JSON.stringify(actual)!==expected)throw new Error('Runtime package differs from manifest');
 const deploymentHash=createHash('sha256').update(JSON.stringify(actual)).digest('hex');
 const signingSettings=['TASK_MODEL_TRANSPORT_KEY_ID','TASK_MODEL_TRANSPORT_PRIVATE_KEY_FILE','TASK_MODEL_TRANSPORT_COLLECTOR_ID','TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256'];
 const signingConfigured=signingSettings.some(key=>Boolean(process.env[key]?.trim()));
 phase='task-transport-package-binding';
 if(signingConfigured&&(!/^[a-f0-9]{64}$/.test(process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256??'')
  ||process.env.TASK_MODEL_TRANSPORT_DEPLOYMENT_SHA256!==deploymentHash
  ||mode!=='--verify'&&signingSettings.some(key=>!process.env[key]?.trim())))throw new Error('Task transport package enrollment unavailable');
 const taskBinding={taskTransportPackageBindingRequired:signingConfigured,taskTransportPackageBindingVerified:signingConfigured};
 if(mode==='--verify'){
  console.log(JSON.stringify({mainAgentRuntimeIntegrity:'passed',files:Object.keys(actual.files).length,deploymentHash,...taskBinding,...boundary,productionQualified:false}));
 }else{
  phase='database-configuration';
  if(process.env.NODE_ENV!=='production'||!process.env.DATABASE_URL||process.env.DATABASE_MIGRATION_URL)throw new Error('Restricted application database connection required');
  if(mode==='worker'){phase='worker';await import('./worker.mjs');}
  else{
   // The API's outer run/store files live outside the immutable package. Inner
   // business checkpoints and authoritative task receipts remain in PostgreSQL.
   await mkdir('/runtime',{recursive:true});
   phase='state-directory';const probe=`/runtime/.main-agent-write-check-${randomUUID()}`;
   const descriptor=await open(probe,'wx',0o600);await descriptor.close();await unlink(probe);
   phase='api';const {startServer}=await import('@langchain/langgraph-api/server');
   const runtime=await startServer({host:'127.0.0.1',port:2024,nWorkers:1,cwd:'/runtime',graphs:{main_agent_workflow:'/app/server.mjs:mainAgentWorkflowGraph'}});
   let closing=false;
   const close=async()=>{if(closing)return;closing=true;await runtime.cleanup();await globalThis.__networkCopilotPool?.end();process.exit(0);};
   process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
   console.log(JSON.stringify({mainAgentApi:'ready',listener:'127.0.0.1:2024',deploymentHash,...taskBinding,productionQualified:false}));
  }
 }
}catch(error){console.error(JSON.stringify({mainAgentRuntime:'failed',phase,code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(error.code)?error.code:'unavailable'}));process.exitCode=1;}
