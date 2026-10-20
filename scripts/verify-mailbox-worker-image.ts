import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

assert.equal(process.env.MA24_DISPOSABLE_MAILBOX_IMAGE,'1');
const image=process.env.MA24_MAILBOX_IMAGE!,network=process.env.MA24_MAILBOX_NETWORK!,ca=process.env.MA24_MAILBOX_CA!;
const runtime=new URL(process.env.MA24_MAILBOX_RUNTIME_DATABASE_URL!);
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);
assert.equal(runtime.hostname,'pilot-db');assert.equal(runtime.searchParams.get('sslmode'),'verify-full');assert(ca.includes('BEGIN CERTIFICATE'));
const docker=(args:string[])=>new Promise<{code:number|null;output:string}>((resolve,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout!.on('data',d=>{output+=d;});child.stderr!.on('data',d=>{output+=d;});
 child.once('error',reject);child.once('exit',code=>resolve({code,output:output.trim()}));
});
const execute=async(args:string[])=>{const result=await docker(args);assert.equal(result.code,0,result.output.slice(-1500));return result.output;};
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1000,gid=1000,mode=0700,size=64m'];
const metadata=JSON.parse(await execute(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
const integrity=JSON.parse(await execute(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
const source='src/lib/mailbox/work-queue.ts',archived=execFileSync('tar',['-xOf','-',source],{input:execFileSync('git',['archive','--format=tar',metadata.revision,source])});
const sourceSha256=createHash('sha256').update(archived).digest('hex');
const measured=JSON.parse(await execute(['run','--rm','--network','none',...restricted,'--entrypoint','node',metadata.id,'-e',
 "const f=require('fs'),c=require('crypto'),h=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');console.log(JSON.stringify({source:h('/app/.skill-runtime-source/src/lib/mailbox/work-queue.ts'),worker:h('/app/mailbox-worker.mjs'),manifest:JSON.parse(f.readFileSync('/app/build-manifest.json','utf8')).artifacts['mailbox-worker']}));"]));
assert.equal(measured.source,sourceSha256);assert.equal(measured.worker,measured.manifest.sha256);
assert(measured.manifest.inputs.includes('scripts/run-mailbox-worker.ts'));assert(measured.manifest.inputs.includes(source));
let worker:string|undefined;
try{
 worker=await execute(['run','--detach','--name',`ma24-mailbox-image-${randomUUID().slice(0,8)}`,'--network',network,...restricted,
  '--env',`DATABASE_URL=${runtime}`,'--env',`DATABASE_SSL_CA=${ca}`,metadata.id,'mailbox-worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
 assert.equal(await execute(['wait',worker]),'0',await execute(['logs',worker]));await execute(['rm','--volumes',worker]);worker=undefined;
 for(const scenario of [
  {name:'invalid-argument',args:['mailbox-worker','--unexpected'],env:[],phase:'startup'},
  {name:'missing-database',args:['mailbox-worker','--once'],env:[],phase:'database-configuration'},
  {name:'migration-login-present',args:['mailbox-worker','--once'],env:['--env',`DATABASE_URL=${runtime}`,'--env','DATABASE_MIGRATION_URL=synthetic-prohibited'],phase:'database-configuration'},
 ]){
  const rejected=await docker(['run','--rm','--network','none',...restricted,...scenario.env,metadata.id,...scenario.args]);
  assert.equal(rejected.code,1,scenario.name);assert.equal(JSON.parse(rejected.output).phase,scenario.phase);
 }
}finally{if(worker)await execute(['rm','--force','--volumes',worker]);}
console.log(JSON.stringify({mailboxWorkerImage:'passed',image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,
 archivedWorkQueueSha256:sourceSha256,compiledMailboxWorkerSha256:measured.worker,normalRestrictedTlsEmptyQueueExit:0,
 invalidArgumentRejected:true,missingDatabaseRejected:true,migrationConnectionRejected:true,fixtureWorkerContainersCleaned:true,
 realMailboxConnections:0,modelCalls:0,fullImapRecoveryInImageVerified:false,productionQualified:false}));
