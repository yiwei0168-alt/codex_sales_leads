import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import net from 'node:net';
import {performance} from 'node:perf_hooks';
import {Client} from 'pg';

assert.equal(process.argv.length,2,'No arguments are supported');
const suffix=randomBytes(6).toString('hex'),container=`ma24-preclaim-${suffix}`;
const password=randomBytes(24).toString('hex');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const docker=(args:string[])=>{
 const r=spawnSync('docker',args,{env:{...process.env,POSTGRES_PASSWORD:password},encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,`Disposable PostgreSQL command failed: ${r.stderr.slice(-1000)}`);return r.stdout.trim();
};
let created=false,admin:Client|undefined;
const results:unknown[]=[];
let normalEmptyWorkerVerified=false;
try{
 docker(['run','--detach','--rm','--name',container,'--env','POSTGRES_PASSWORD','--publish','127.0.0.1::5432','pgvector/pgvector:pg16']);created=true;
 let ready=false;
 for(let i=0;i<100;i++){
  const r=spawnSync('docker',['exec',container,'pg_isready','-U','postgres'],{encoding:'utf8',windowsHide:true});
  if(r.status===0){ready=true;break;}await pause(200);
 }
 assert(ready,'Disposable PostgreSQL did not become ready');
 const port=Number(docker(['inspect','--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',container]));
 assert(Number.isSafeInteger(port)&&port>0);
 const direct=`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
 admin=new Client({connectionString:direct});await admin.connect();
 await admin.query(`create role network_copilot_app nologin;create role preclaim_login login password '${password}';
 grant network_copilot_app to preclaim_login;create table preclaim_trace(phase text not null);
 create function claim_next_agent_model_batch(uuid) returns table(id uuid,user_id uuid,poll_token uuid)
 language plpgsql as $$begin insert into preclaim_trace values('batch');return;end$$;
 create function claim_next_agent_schedule(uuid) returns table(id uuid,user_id uuid,lease_token uuid)
 language plpgsql as $$begin insert into preclaim_trace values('schedule');return;end$$;
 create function claim_next_agent_run(text) returns table(id uuid,user_id uuid,lease_token uuid)
 language plpgsql as $$begin insert into preclaim_trace values('run');return;end$$;
 grant insert on preclaim_trace to network_copilot_app;`);
 const phases=[['batch','claim_next_agent_model_batch',[]],['schedule','claim_next_agent_schedule',['batch']],['run','claim_next_agent_run',['batch','schedule']]] as const;
 for(const [phase,target,prior] of phases){
  await admin.query('truncate preclaim_trace');
  const sockets=new Set<net.Socket>();let interceptedAt:number|undefined;
  const proxy=net.createServer(front=>{
   const upstream=net.connect({host:'127.0.0.1',port});sockets.add(front);sockets.add(upstream);
   let blocked=false,probe='';
   front.on('data',chunk=>{
    if(blocked)return;
    probe=(probe+chunk.toString('utf8')).slice(-4096);
    if(probe.includes(target)){blocked=true;interceptedAt=performance.now();}
    // Deliver the claim statement, then blackhole both directions before its reply/COMMIT.
    upstream.write(chunk);
   });
   upstream.on('data',chunk=>{if(!blocked)front.write(chunk);});
   front.on('error',()=>upstream.destroy());upstream.on('error',()=>{if(!blocked)front.destroy();});
   front.on('close',()=>{sockets.delete(front);upstream.destroy();});
   upstream.on('close',()=>{sockets.delete(upstream);if(!blocked)front.destroy();});
  });
  await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
  let stdout='',stderr='';
  try{
   const address=proxy.address();assert(address&&typeof address!=='string');
   const url=`postgresql://preclaim_login:${password}@127.0.0.1:${address.port}/postgres?application_name=${container}`;
   const worker=spawn(process.execPath,['--import','tsx','scripts/run-main-agent-worker.ts','--once'],{
    cwd:process.cwd(),windowsHide:true,timeout:35_000,killSignal:'SIGKILL',env:{...process.env,DATABASE_URL:url,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
   worker.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-16000);});
   worker.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-16000);});
   const exit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
    worker.once('error',reject);worker.once('exit',(code,signal)=>resolve({code,signal}));
   });
   assert(interceptedAt!==undefined,`Worker did not reach the ${phase} claim`);
   const elapsedMs=Math.round(performance.now()-interceptedAt);
   assert.equal(exit.signal,null,`Worker required forced termination in ${phase}`);
   assert.equal(exit.code,1,`Expected a safe failed worker exit in ${phase}`);
   assert(elapsedMs>=17_000&&elapsedMs<30_000,`Unbounded ${phase} wait: ${elapsedMs}ms`);
   assert((stdout+stderr).includes('DATABASE_DEADLINE_EXCEEDED'),'Worker did not report a database deadline');
   let active=1;
   for(let i=0;i<50&&active;i++){
    active=Number((await admin.query('select count(*) from pg_stat_activity where application_name=$1 and xact_start is not null',[container])).rows[0].count);
    if(active)await pause(100);
   }
   assert.equal(active,0,'Timed-out worker left an active database transaction');
   const committed:string[]=(await admin.query<{phase:string}>('select phase from preclaim_trace order by ctid')).rows.map(row=>row.phase);
   assert.deepEqual(committed,[...prior],'Blocked claim committed or a later worker phase ran');
   results.push({phase,networkReplySuppressed:true,elapsedMs,exitCode:exit.code,committedPriorPhases:committed,blockedClaimRolledBack:true,noActiveTransaction:true});
  }finally{
   for(const socket of sockets)socket.destroy();
   await new Promise<void>(resolve=>proxy.close(()=>resolve()));
  }
 }
 await admin.query('truncate preclaim_trace');
 const normalUrl=`postgresql://preclaim_login:${password}@127.0.0.1:${port}/postgres`;
 const normal=spawn(process.execPath,['--import','tsx','scripts/run-main-agent-worker.ts','--once'],{
  cwd:process.cwd(),windowsHide:true,timeout:15_000,killSignal:'SIGKILL',env:{...process.env,DATABASE_URL:normalUrl,NODE_ENV:'test'},stdio:['ignore','ignore','pipe']});
 let normalError='';normal.stderr.on('data',chunk=>{normalError=(normalError+chunk).slice(-16000);});
 const normalExit=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
  normal.once('error',reject);normal.once('exit',(code,signal)=>resolve({code,signal}));
 });
 assert.equal(normalExit.signal,null,'Normal empty worker required forced termination');
 assert.equal(normalExit.code,0,`Normal empty worker failed: ${normalError.slice(-1000)}`);
 assert.deepEqual((await admin.query<{phase:string}>('select phase from preclaim_trace order by ctid')).rows.map(row=>row.phase),['batch','schedule','run']);
 normalEmptyWorkerVerified=true;
}finally{
 try{await admin?.end();}finally{if(created)docker(['rm','--force','--volumes',container]);}
}
const files=['src/lib/rag/db.ts','scripts/run-main-agent-worker.ts'];
const sources=await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})));
console.log(JSON.stringify({schema:'ma24-preclaim-deadline-v1',passed:true,results,sources,normalEmptyWorkerVerified,disposableContainerRemoved:true,modelCalls:0,sourceDatabaseChanged:false,
 scope:'Actual source Worker initial batch/schedule/run claim network blackholes on an isolated synthetic PostgreSQL cluster; not a compiled image or production acceptance.'}));
