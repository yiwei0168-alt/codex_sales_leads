import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';

// This runs only migration 159 in a new network-isolated, disposable database.
// Fixtures deliberately do not represent inspected or qualified runtime packages.
const name=`ma24-package-migration-${randomUUID()}`;
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,windowsHide:true,stdio:['pipe','pipe','pipe']});
const sql=text=>docker(['exec','-i',name,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At'],text).trim();
const childSql=text=>{
 const child=spawn('docker',['exec','-i',name,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{windowsHide:true});
 let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});child.stdin.end(text);
 return {child,done:new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,output}));})};
};
const literal=text=>`'${text.replaceAll("'","''")}'`;
const fixture={protocol:'skill-runtime-package-registration-v1',binding:{keyId:'synthetic-task-key',purpose:'task-model-transport',collectorId:'synthetic',deploymentHash:'a'.repeat(64),publicKeyHash:'b'.repeat(64)},
 inspection:{role:'main-agent',imageId:`sha256:${'c'.repeat(64)}`,sourceCommit:'d'.repeat(40),deploymentHash:'a'.repeat(64),runtimeHash:'e'.repeat(64),nodeSha256:'f'.repeat(64),node:'24.21.0',platform:'linux',arch:'x64',sourceInputs:1,files:1},
 validUntil:new Date(Date.now()+3600000).toISOString()};
const doc=literal(JSON.stringify(fixture)),hash=literal('1'.repeat(64)),request=literal(randomUUID());
let started=false;
try{
 docker(['run','--detach','--name',name,'--network','none','--env','POSTGRES_HOST_AUTH_METHOD=trust','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=256m','pgvector/pgvector:pg16']);started=true;
 for(let tries=0;;tries++){
  try{sql('select 1');break;}catch{assert(tries<40,'Disposable PostgreSQL did not become ready');await new Promise(resolve=>setTimeout(resolve,250));}
 }
 sql('create role network_copilot_app; create role network_copilot_skill_collector;');
 sql(readFileSync(new URL('../db/migrations/159_skill_runtime_package_registration.sql',import.meta.url),'utf8'));
 // Readback, request idempotency and optimistic stream revision.
 assert.equal(sql(`select register_skill_runtime_package(${doc},${hash},${request},null)`),'1');
 assert.equal(sql(`select register_skill_runtime_package(${doc},${hash},${request},null)`),'1');
 const denied=(text,pattern)=>{assert.throws(()=>sql(text),error=>pattern.test(error.stderr?.toString()??''));};
 denied(`select register_skill_runtime_package(${doc},${hash},'${randomUUID()}',null)`,/revision changed/);
 denied(`select register_skill_runtime_package(${doc},'${'2'.repeat(64)}',${request},1)`,/request changed/);
 const noDate={...fixture};delete noDate.validUntil;
 denied(`select register_skill_runtime_package(${literal(JSON.stringify(noDate))},${hash},'${randomUUID()}',1)`,/registration invalid/);
 denied(`select register_skill_runtime_package(${literal(JSON.stringify({...fixture,validUntil:'2000-01-01T00:00:00.000Z'}))},${hash},'${randomUUID()}',1)`,/registration invalid/);
 // Exact database precision: one microsecond after an attempt is not prior enrollment.
 assert.equal(sql(`select registered_at <= registered_at-interval '1 microsecond' from skill_runtime_package_registration where revision=1`),'f');
 for(const role of ['network_copilot_app','network_copilot_skill_collector']){
  assert.match(sql(`set role ${role};select count(*) from skill_runtime_package_registration`),/1$/);
  denied(`set role ${role};select register_skill_runtime_package(${doc},${hash},'${randomUUID()}',1)`,/permission denied/);
  denied(`set role ${role};insert into skill_runtime_package_withdrawal values('${randomUUID()}',1,'denied',clock_timestamp(),current_user)`,/permission denied/);
  denied(`set role ${role};update skill_runtime_package_registration set registered_at=clock_timestamp()`,/permission denied/);
 }
 for(const statement of ['update skill_runtime_package_registration set registered_at=clock_timestamp()',
  'delete from skill_runtime_package_registration','truncate skill_runtime_package_registration cascade'])denied(statement,/history is immutable/);
 const withdrawn=literal(randomUUID());assert.equal(sql(`select withdraw_skill_runtime_package(${withdrawn},1,'test withdrawal')`),withdrawn.slice(1,-1));
 assert.equal(sql(`select withdraw_skill_runtime_package(${withdrawn},1,'test withdrawal')`),withdrawn.slice(1,-1));
 denied(`select withdraw_skill_runtime_package(${withdrawn},1,'changed reason')`,/request changed/);
 denied(`select withdraw_skill_runtime_package('${randomUUID()}',1,'second request')`,/already withdrawn/);
 denied('delete from skill_runtime_package_withdrawal',/history is immutable/);
 assert.equal(sql(`select register_skill_runtime_package(${doc},${hash},'${randomUUID()}',1)`),'2');
 // A fresh registration is required after withdrawal; latest row never falls back.
 assert.equal(sql(`select r.revision::text||':'||exists(select 1 from skill_runtime_package_withdrawal w where w.registration_revision=r.revision)::text from skill_runtime_package_registration r order by revision desc limit 1`),'2:false');
 // Real concurrent writer must wait for retained shared admission, even on direct DML.
 const holder=childSql(`begin;select pg_advisory_xact_lock_shared(hashtextextended('skill-runtime-packages-v1',0));select pg_sleep(3);commit;`);
 for(let tries=0;;tries++){
  const present=sql("select count(*) from pg_locks where locktype='advisory' and mode='ShareLock' and granted");
  if(present==='1')break;assert(tries<30,'Reader admission not acquired');await new Promise(resolve=>setTimeout(resolve,50));
 }
 const writer=childSql(`insert into skill_runtime_package_withdrawal(request_id,registration_revision,reason) values('${randomUUID()}',2,'concurrent withdrawal');`);
 let waiting=false;
 for(let tries=0;tries<30;tries++){
  if(sql("select count(*) from pg_locks where locktype='advisory' and mode='ExclusiveLock' and not granted")==='1'){waiting=true;break;}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert(waiting,'Direct writer bypassed retained package admission');
 assert.equal(sql('select count(*) from skill_runtime_package_withdrawal where registration_revision=2'),'0');
 assert.equal((await holder.done).code,0);assert.equal((await writer.done).code,0);
 assert.equal(sql('select count(*) from skill_runtime_package_withdrawal where registration_revision=2'),'1');
 console.log(JSON.stringify({runtimePackageMigration:'passed',migration:159,network:'none',database:'disposable',
  nativeIdempotence:true,expectedRevision:true,missingAndExpiredDateDenied:true,applicationAndCollectorWriteDenied:true,
  immutableHistory:true,withdrawalAppendOnly:true,sharedAdmissionRetainedUntilCommit:true,directWriterWaitObserved:true,
  actualInspectedPackagePublication:false,readinessDatabaseIntegration:false,productionQualified:false,actualModelCalls:0}));
}finally{if(started)docker(['rm','--force',name]);}
