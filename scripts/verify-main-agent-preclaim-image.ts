import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {Client} from 'pg';

const argument=process.argv[2];
assert(process.argv.length===3&&argument?.startsWith('--worker-image='),'Set only --worker-image=<fixed image>');
const image=argument.slice('--worker-image='.length);
assert(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(image),'Invalid image');
const suffix=randomBytes(6).toString('hex'),prefix=`ma24-preclaim-image-${suffix}`,password=randomBytes(24).toString('hex');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const docker=(args:string[],env:NodeJS.ProcessEnv=process.env)=>{
 const result=spawnSync('docker',args,{env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 assert.equal(result.status,0,`Isolated image check command failed: ${result.stderr.slice(-1000)}`);return result.stdout.trim();
};
const resources=new Set<string>(),results:unknown[]=[];
const restricted=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true'];
const metadata=JSON.parse(docker(['image','inspect','--format','{{json .}}',image])) as {Id:string;Config:{Labels:Record<string,string>}};
const commit=metadata.Config.Labels['org.opencontainers.image.revision'];
assert(/^[a-f0-9]{40}$/.test(commit),'Image has no fixed source revision');
const integrity=JSON.parse(docker(['run','--rm','--network','none',...restricted,image,'--verify'])) as {mainAgentRuntimeIntegrity:string;deploymentHash:string;files:number};
assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
const canonicalDb=execFileSync('git',['show',`${commit}:src/lib/rag/db.ts`]);
const archivedDb=execFileSync('tar',['-xOf','-','src/lib/rag/db.ts'],{input:execFileSync('git',['archive','--format=tar',commit,'src/lib/rag/db.ts'])});
assert.equal(archivedDb.toString('utf8').replaceAll('\r\n','\n'),canonicalDb.toString('utf8'),'Archive differs from canonical source beyond CRLF conversion');
const canonicalDbHash=createHash('sha256').update(canonicalDb).digest('hex');
const expectedDbHash=createHash('sha256').update(archivedDb).digest('hex');
const measured=JSON.parse(docker(['run','--rm','--network','none',...restricted,'--entrypoint','node',image,'-e',
 `const f=require('fs'),c=require('crypto');process.stdout.write(JSON.stringify({dbSha256:c.createHash('sha256').update(f.readFileSync('/app/.skill-runtime-source/src/lib/rag/db.ts')).digest('hex'),build:JSON.parse(f.readFileSync('/app/build-manifest.json','utf8'))}));`])) as {dbSha256:string;build:{artifacts:{worker:{sha256:string;inputs:string[]}}}};
assert.equal(measured.dbSha256,expectedDbHash,'Packaged database source differs from fixed revision');
assert(measured.build.artifacts.worker.inputs.includes('scripts/run-main-agent-worker.ts'));
let admin:Client|undefined,failure:unknown,normalEmptyWorkerVerified=false;
const create=(name:string,args:string[],env:NodeJS.ProcessEnv=process.env)=>{docker(['create','--name',name,...args],env);resources.add(name);};
const remove=(name:string)=>{docker(['rm','--force','--volumes',name]);resources.delete(name);};
const runWorker=async(name:string,url:string)=>{
 create(name,['--network',`container:${prefix}`, ...restricted,'--env','DATABASE_URL','--env','DATABASE_APPLICATION_ROLE=network_copilot_app',
  '--env','NODE_ENV=production','--env','LANGGRAPH_API_URL=http://127.0.0.1:1',image,'worker','--once'],{...process.env,DATABASE_URL:url});
 const child=spawn('docker',['start','--attach',name],{windowsHide:true,timeout:50_000,killSignal:'SIGKILL',stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',part=>{output=(output+part).slice(-16000);});child.stderr.on('data',part=>{output=(output+part).slice(-16000);});
 const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 assert.equal(exit.signal,null,'Worker required forced termination');
 const state=JSON.parse(docker(['inspect','--format','{{json .State}}',name])) as {Running:boolean;ExitCode:number};
 assert.equal(state.Running,false,'Worker still running');remove(name);return {exitCode:state.ExitCode,output};
};
try{
 create(prefix,['--env','POSTGRES_PASSWORD','--publish','127.0.0.1::5432','pgvector/pgvector:pg16'],{...process.env,POSTGRES_PASSWORD:password});
 docker(['start',prefix]);let ready=false;
 for(let i=0;i<100;i++){
  const state=spawnSync('docker',['exec',prefix,'pg_isready','-U','postgres'],{encoding:'utf8',windowsHide:true});
  if(state.status===0){ready=true;break;}await pause(200);
 }
 assert(ready,'Isolated PostgreSQL not ready');
 const port=Number(docker(['inspect','--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',prefix]));
 assert(Number.isSafeInteger(port)&&port>0);
 admin=new Client({connectionString:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`});await admin.connect();
 await admin.query(`create role network_copilot_app nologin;create role preclaim_login login password '${password}';grant network_copilot_app to preclaim_login;
 create table preclaim_trace(phase text not null);grant insert on preclaim_trace to network_copilot_app;
 create function claim_next_agent_model_batch(uuid) returns table(id uuid,user_id uuid,poll_token uuid) language plpgsql as $$begin insert into preclaim_trace values('batch');return;end$$;
 create function claim_next_agent_schedule(uuid) returns table(id uuid,user_id uuid,lease_token uuid) language plpgsql as $$begin insert into preclaim_trace values('schedule');return;end$$;
 create function claim_next_agent_run(text) returns table(id uuid,user_id uuid,lease_token uuid) language plpgsql as $$begin insert into preclaim_trace values('run');return;end$$;`);
 const phases=[['batch','claim_next_agent_model_batch',[]],['schedule','claim_next_agent_schedule',['batch']],['run','claim_next_agent_run',['batch','schedule']]] as const;
 for(const [phase,target,prior] of phases){
  await admin.query('truncate preclaim_trace');const proxyName=`${prefix}-${phase}-proxy`;
  const proxyCode=`const net=require('net'),{performance}=require('perf_hooks');net.createServer(front=>{
   const upstream=net.connect(5432,'127.0.0.1');let blocked=false,probe='',started;
   front.on('data',chunk=>{if(blocked)return;probe=(probe+chunk.toString('utf8')).slice(-4096);
    if(probe.includes(${JSON.stringify(target)})){blocked=true;started=performance.now();console.log(JSON.stringify({intercepted:true}));}upstream.write(chunk);});
   upstream.on('data',chunk=>{if(!blocked)front.write(chunk);});front.on('error',()=>upstream.destroy());upstream.on('error',()=>{if(!blocked)front.destroy();});
   front.on('close',()=>{if(blocked)console.log(JSON.stringify({closed:true,elapsedMs:Math.round(performance.now()-started)}));upstream.destroy();});
   upstream.on('close',()=>{if(!blocked)front.destroy();});
  }).listen(15432,'127.0.0.1',()=>console.log(JSON.stringify({ready:true})));`;
  create(proxyName,['--network',`container:${prefix}`,...restricted,'--entrypoint','node',image,'-e',proxyCode]);docker(['start',proxyName]);
  let proxyReady=false;
  for(let i=0;i<50;i++){if(docker(['logs',proxyName]).includes('"ready":true')){proxyReady=true;break;}await pause(100);}
  assert(proxyReady,'Namespace proxy not ready');
  const url=`postgresql://preclaim_login:${password}@127.0.0.1:15432/postgres?application_name=${prefix}`;
  const worker=await runWorker(`${prefix}-${phase}-worker`,url);
  assert.equal(worker.exitCode,1,'Blackholed worker did not fail safely');assert(worker.output.includes('DATABASE_DEADLINE_EXCEEDED'),'Missing deadline rejection');
  let logRows:{intercepted?:boolean;closed?:boolean;elapsedMs?:number}[]=[];
  for(let i=0;i<30;i++){
   logRows=docker(['logs',proxyName]).split('\n').filter(Boolean).map(line=>JSON.parse(line));
   if(logRows.some(row=>row.closed))break;await pause(100);
  }
  assert(logRows.some(row=>row.intercepted),'Target claim was not forwarded');
  const elapsedMs=logRows.find(row=>row.closed)?.elapsedMs;assert(typeof elapsedMs==='number'&&elapsedMs>=17000&&elapsedMs<30000,'Blackhole did not close within deadline');
  let active=1;
  for(let i=0;i<50&&active;i++){
   active=Number((await admin.query('select count(*) from pg_stat_activity where application_name=$1 and xact_start is not null',[prefix])).rows[0].count);if(active)await pause(100);
  }
  assert.equal(active,0,'Worker left an active transaction');
  const committed:string[]=(await admin.query<{phase:string}>('select phase from preclaim_trace order by ctid')).rows.map(row=>row.phase);
  assert.deepEqual(committed,[...prior],'Claim committed or later preparation ran');
  results.push({phase,elapsedMs,exitCode:worker.exitCode,networkReplySuppressed:true,committedPriorPhases:committed,blockedClaimRolledBack:true,noActiveTransaction:true});remove(proxyName);
 }
 await admin.query('truncate preclaim_trace');
 const normal=await runWorker(`${prefix}-normal-worker`,`postgresql://preclaim_login:${password}@127.0.0.1:5432/postgres`);
 assert.equal(normal.exitCode,0,`Normal empty Worker failed: ${normal.output.slice(-1000)}`);
 assert.deepEqual((await admin.query<{phase:string}>('select phase from preclaim_trace order by ctid')).rows.map(row=>row.phase),['batch','schedule','run']);normalEmptyWorkerVerified=true;
}catch(error){failure=error;}finally{
 const cleanupErrors:unknown[]=[];try{await admin?.end();}catch(error){cleanupErrors.push(error);}
 for(const name of [...resources].reverse()){try{remove(name);}catch(error){cleanupErrors.push(error);}}
 if(cleanupErrors.length)throw new AggregateError([...(failure?[failure]:[]),...cleanupErrors],'Isolated image verification cleanup failed');
}
if(failure)throw failure;
console.log(JSON.stringify({schema:'ma24-preclaim-image-v1',passed:true,image,imageId:metadata.Id,commit,integrity,
 canonicalDbSha256:canonicalDbHash,archivedDbSha256:expectedDbHash,dbSourceSha256:measured.dbSha256,compiledWorkerSha256:measured.build.artifacts.worker.sha256,results,normalEmptyWorkerVerified,
 disposableResourcesRemoved:resources.size===0,productionEnvironment:true,modelCalls:0,sourceDatabaseChanged:false,
 scope:'Fixed Linux Worker entrypoint on an isolated synthetic database with empty claim functions; not queued real-task, provider, full-schema or production acceptance.'}));
