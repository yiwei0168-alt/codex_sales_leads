import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {Client} from 'pg';
import {getPool,tenantQuery} from '../src/lib/rag/db';
import {encryptMailboxCredential,decryptMailboxContent} from '../src/lib/mailbox/crypto';
import {enqueueSync} from '../src/lib/mailbox/work-queue';

assert.equal(process.env.MA24_DISPOSABLE_MAILBOX_IMAGE,'1');
const image=process.env.MA24_MAILBOX_IMAGE!,network=process.env.MA24_MAILBOX_NETWORK!,ca=process.env.MA24_MAILBOX_CA!,dbContainer=process.env.MA24_MAILBOX_DATABASE_CONTAINER!;
const runtime=new URL(process.env.MA24_MAILBOX_RUNTIME_DATABASE_URL!),application=new URL(process.env.DATABASE_URL!),migration=new URL(process.env.DATABASE_MIGRATION_URL!);
assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);assert.match(dbContainer,/^[a-f0-9]{64}$/);
assert.equal(runtime.hostname,'pilot-db');assert.equal(runtime.searchParams.get('sslmode'),'verify-full');assert.equal(application.hostname,'127.0.0.1');assert.equal(application.host+application.pathname,migration.host+migration.pathname);
const docker=(args:string[],input?:string)=>new Promise<string>((resolve,reject)=>{
 const child=spawn('docker',args,{windowsHide:true,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});let output='';
 child.stdout!.on('data',d=>{output+=d;});child.stderr!.on('data',d=>{output+=d;});if(input!==undefined)child.stdin!.end(input);
 child.once('error',reject);child.once('exit',code=>code===0?resolve(output.trim()):reject(new Error(`Isolated IMAP image Docker failed (${code}): ${output.slice(-1200)}`)));
});
const restricted=['--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1000,gid=1000,mode=0700,size=64m'];
const owner=randomUUID(),peer=randomUUID(),connection=randomUUID(),tag=owner.replaceAll('-',''),mailNetwork=`ma24-imap-internal-${tag}`;
// This public-form subnet exists only inside a Docker --internal bridge. There
// are no published ports or external routes; product public-address validation
// and its real DNS resolver remain unchanged.
const octets=randomBytes(2),subnet=`11.${octets[0]}.${octets[1]}.0/24`,address=`11.${octets[0]}.${octets[1]}.2`;
const purpose='isolated-imap-wire',pause=(ms:number)=>new Promise(done=>setTimeout(done,ms));
process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
const admin=new Client({connectionString:migration.toString()});await admin.connect();
let createdNetwork=false,stub:string|undefined,worker:string|undefined,volume:string|undefined,receipt:Record<string,unknown>|undefined;
try{
 assert.equal((await admin.query("select count(*)::int n from mailbox_work_job where status in ('queued','running')")).rows[0].n,0);
 const metadata=JSON.parse(await docker(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(metadata.id,/^sha256:[a-f0-9]{64}$/);assert.match(metadata.revision,/^[a-f0-9]{40}$/);
 const integrity=JSON.parse(await docker(['run','--rm','--network','none',...restricted,metadata.id,'--verify']));assert.equal(integrity.mainAgentRuntimeIntegrity,'passed');
 const sourcePaths=['src/lib/mailbox/work-queue.ts','src/lib/mailbox/alimail-imap.ts','src/lib/mailbox/connection-config.ts'];
 const sourceHashes=Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(execFileSync('tar',['-xOf','-',path],{input:execFileSync('git',['archive','--format=tar',metadata.revision,path])})).digest('hex')]));
 const measured=JSON.parse(await docker(['run','--rm','--network','none',...restricted,'--entrypoint','node',metadata.id,'-e',
  `const f=require('fs'),c=require('crypto'),h=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');console.log(JSON.stringify({sources:Object.fromEntries(${JSON.stringify(sourcePaths)}.map(p=>[p,h('/app/.skill-runtime-source/'+p)])),worker:h('/app/mailbox-worker.mjs'),declared:JSON.parse(f.readFileSync('/app/build-manifest.json','utf8')).artifacts['mailbox-worker'].sha256}));`]));
 assert.deepEqual(measured.sources,sourceHashes);assert.equal(measured.worker,measured.declared);
 await docker(['network','create','--internal','--subnet',subnet,'--label',`ma24-purpose=${purpose}`,mailNetwork]);createdNetwork=true;
 const inspected=JSON.parse(await docker(['network','inspect',mailNetwork]));assert.equal(inspected[0].Internal,true);assert.equal(inspected[0].IPAM.Config[0].Subnet,subnet);
 const keyPath=`/tmp/ma24-imap-${tag}.key`,certPath=`/tmp/ma24-imap-${tag}.crt`;
 await docker(['exec',dbContainer,'openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=imap.example.invalid','-addext','subjectAltName=DNS:imap.example.invalid','-keyout',keyPath,'-out',certPath]);
 const key=await docker(['exec',dbContainer,'cat',keyPath]),cert=await docker(['exec',dbContainer,'cat',certPath]);
 const compiled=await build({stdin:{contents:`import {readFile,unlink} from 'node:fs/promises';import http from 'node:http';
  import {startMa24ImapWireServer} from ${JSON.stringify(resolve('scripts/lib/ma24-imap-wire-server.ts'))};
  let config;for(let i=0;i<200;i++){try{config=JSON.parse(await readFile('/tmp/ma24-imap-config.json','utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(r=>setTimeout(r,100));}}
  if(!config)throw Error('Fixture config missing');await unlink('/tmp/ma24-imap-config.json');
  const state={ca:'',port:0,validity:1,disconnect:true,disconnectFolder:'Sent',commands:[]};
  const wire=await startMa24ImapWireServer(state,{...config,host:'0.0.0.0'});
  http.createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({port:wire.port,held:wire.held(),commands:state.commands}));}).listen(8445,'127.0.0.1');
  console.log('isolatedImapWireReady');`,resolveDir:process.cwd(),sourcefile:'isolated-imap-stub.ts'},bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'warning'});
 stub=await docker(['run','--detach','--name',`ma24-imap-stub-${tag.slice(0,8)}`,'--network',mailNetwork,'--ip',address,...restricted,'--entrypoint','node',metadata.id,'--input-type=module','-e',compiled.outputFiles[0].text]);assert.match(stub,/^[a-f0-9]{64}$/);
 await docker(['exec','--interactive',stub,'node','-e',"let p=[];process.stdin.on('data',d=>p.push(d));process.stdin.on('end',()=>require('fs').writeFileSync('/tmp/ma24-imap-config.json',Buffer.concat(p),{mode:0o600,flag:'wx'}));"],JSON.stringify({key,cert}));
 let ready=false;for(let i=0;i<100;i++){if((await docker(['logs',stub])).includes('isolatedImapWireReady')){ready=true;break;}await pause(100);}assert(ready);
 const status=async()=>JSON.parse(await docker(['exec',stub!,'node','--input-type=module','-e',"console.log(await (await fetch('http://127.0.0.1:8445')).text());"]));
 const port=(await status()).port;assert(Number.isInteger(port)&&port>1023&&port<65536);
 const volumeName=`ma24-imap-ca-${tag}`;assert.equal(await docker(['volume','create','--label',`ma24-purpose=${purpose}`,volumeName]),volumeName);volume=volumeName;
 await docker(['run','--rm','--interactive','--network','none','--read-only','--user','0:0','--cap-drop=ALL','--security-opt','no-new-privileges','--mount',`type=volume,source=${volume},target=/certificates`,'--entrypoint','node',metadata.id,'-e',
  "let p=[];process.stdin.on('data',d=>p.push(d));process.stdin.on('end',()=>require('fs').writeFileSync('/certificates/imap.crt',Buffer.concat(p),{mode:0o644,flag:'wx'}));"],cert);
 for(const id of [owner,peer])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic image IMAP','member','active')",[id,`${id}@example.invalid`]);
 await admin.query(`insert into mailbox_connection(id,user_id,provider,email,display_name,host,port,credential_ciphertext)
  values($1,$2,'standard-imap',$3,'Synthetic image IMAP','imap.example.invalid',$4,$5)`,[connection,owner,`${connection}@example.invalid`,port,encryptMailboxCredential('synthetic-local-only')]);
 const {jobId}=await enqueueSync(owner,{connectionId:connection,folderScope:'both',from:'2026-10-02',through:'2026-10-03',maxMessages:2});
 const start=async()=>{
  worker=await docker(['create','--name',`ma24-imap-worker-${randomUUID().slice(0,8)}`,'--network',network,...restricted,'--add-host',`imap.example.invalid:${address}`,
   '--mount',`type=volume,source=${volume},target=/certificates,readonly`,'--env','NODE_EXTRA_CA_CERTS=/certificates/imap.crt','--env',`DATABASE_URL=${runtime}`,'--env',`DATABASE_SSL_CA=${ca}`,
   '--env',`MAILBOX_CREDENTIAL_KEY=${process.env.MAILBOX_CREDENTIAL_KEY}`,'--env','MAILBOX_DNS_MODE=system',metadata.id,'mailbox-worker','--once']);assert.match(worker,/^[a-f0-9]{64}$/);
  await docker(['network','connect',mailNetwork,worker]);await docker(['start',worker]);
 };
 const finish=async()=>{assert(worker);assert.equal(await docker(['wait',worker]),'0',await docker(['logs',worker]));await docker(['rm','--volumes',worker]);worker=undefined;};
 await start();let held:{id:string;work_lease_token:string}|undefined;
 for(let i=0;i<400;i++){
  held=(await admin.query("select id,work_lease_token from mailbox_sync_run where user_id=$1 and status='running' and processed_count=1 and current_subject='Wire Sent 3'",[owner])).rows[0];
  if(held)break;assert.equal(await docker(['inspect','--format','{{.State.Running}}',worker!]),'true',await docker(['logs',worker!]));await pause(100);
 }
 assert(held);assert.equal((await status()).held,true);assert.equal((await admin.query('select count(*)::int n from mailbox_message where user_id=$1',[owner])).rows[0].n,2);
 const lease=(await admin.query('select lease_token,lease_until::text from mailbox_work_job where id=$1',[jobId])).rows[0];assert.equal(lease.lease_token,held.work_lease_token);
 await docker(['kill','--signal','KILL',worker!]);assert.equal(await docker(['wait',worker!]),'137');await docker(['rm','--volumes',worker!]);worker=undefined;
 assert.deepEqual((await admin.query('select lease_token,lease_until::text from mailbox_work_job where id=$1',[jobId])).rows[0],lease);
 let expired=false;for(let i=0;i<1000;i++){expired=(await admin.query('select lease_until<clock_timestamp() expired from mailbox_work_job where id=$1',[jobId])).rows[0].expired;if(expired)break;await pause(100);}assert(expired);
 await start();await finish();
 const job=(await admin.query('select status,result,lease_token,payload from mailbox_work_job where id=$1',[jobId])).rows[0];assert.equal(job.status,'completed');assert.notEqual(job.lease_token,lease.lease_token);
 assert.deepEqual(job.result,{imported:4,processed:4,discovered:4,remaining:0});assert.equal(job.payload.from,'2026-10-02');assert.equal(job.payload.through,'2026-10-03');
 const messages=(await admin.query('select id,folder_path,message_uid::int uid,direction,subject,body_text,content_ciphertext from mailbox_message where user_id=$1 order by folder_path,message_uid',[owner])).rows;
 assert.deepEqual(messages.map(m=>[m.folder_path,m.uid,m.direction]),[['INBOX',2,'inbound'],['INBOX',4,'inbound'],['Sent',3,'outbound'],['Sent',6,'outbound']]);
 for(const m of messages){assert.equal(m.subject,'');assert.equal(m.body_text,'');assert.match(decryptMailboxContent(owner,m.content_ciphertext).bodyText,/Synthetic body/);}
 assert.deepEqual(await tenantQuery(peer,'select id from mailbox_message where id=any($1::uuid[])',[messages.map(m=>m.id)]),[]);
 assert.equal((await admin.query('select count(*)::int n from mailbox_sync_cursor where user_id=$1',[owner])).rows[0].n,0);assert.equal((await admin.query('select status from mailbox_sync_run where id=$1',[held.id])).rows[0].status,'cancelled');
 const snapshot=async()=>(await admin.query(`select (select jsonb_agg(to_jsonb(j) order by id) from mailbox_work_job j where user_id=$1) jobs,
  (select jsonb_agg(to_jsonb(r) order by id) from mailbox_sync_run r where user_id=$1) runs,(select jsonb_agg(to_jsonb(m) order by id) from mailbox_message m where user_id=$1) messages`,[owner])).rows[0];
 const saved=await snapshot(),beforeEmptyStatus=await status();await start();await finish();assert.deepEqual(await snapshot(),saved);assert.deepEqual(await status(),beforeEmptyStatus);
 const commands:string[]=beforeEmptyStatus.commands;assert(commands.some(c=>/^EXAMINE/.test(c)));assert(commands.some(c=>/^UID FETCH.*BODY\.PEEK\[/.test(c)));assert(!commands.some(c=>/^(SELECT|APPEND|STORE|EXPUNGE|MOVE|COPY|UID STORE|UID MOVE|UID COPY)\b/i.test(c)));
 receipt={mailboxWorkerImapImage:'passed',image,immutableImageId:metadata.id,sourceCommit:metadata.revision,integrity,archivedSourceSha256:sourceHashes,compiledMailboxWorkerSha256:measured.worker,
  unmodifiedProductionEntrypoint:true,unmodifiedReaderAndDnsGuard:true,internalOnlyMailNetwork:true,containerHostsFixtureMapping:true,tlsValidationEnabled:true,databaseVerifyFull:true,
  actualSigkillExitCode:137,committedFirstPageMessages:2,partialSecondPageProcessed:1,originalLeaseUnchanged:true,natural90SecondLeaseRecovery:true,
  newLeaseToken:true,jobResult:job.result,uniqueEncryptedMessages:4,peerReadsRejected:true,globalCursorUnchanged:true,heldBatchCancelled:true,
  subsequentEmptyWorkerExactRowsAndProtocolUnchanged:true,realMailboxConnections:0,modelCalls:0,sentMessages:0,productionQualified:false};
}finally{
 try{if(worker)await docker(['rm','--force','--volumes',worker]);}finally{
  try{if(stub)await docker(['rm','--force','--volumes',stub]);}finally{
   try{if(volume){assert.equal(await docker(['volume','inspect','--format','{{index .Labels "ma24-purpose"}}',volume]),purpose);await docker(['volume','rm',volume]);}}finally{
    try{if(createdNetwork){assert.equal(await docker(['network','inspect','--format','{{index .Labels "ma24-purpose"}}',mailNetwork]),purpose);await docker(['network','rm',mailNetwork]);}}finally{
     await getPool().end();try{for(const table of ['mailbox_message','mailbox_sync_run','mailbox_work_job'])await admin.query(`delete from ${table} where user_id=$1`,[owner]);await admin.query('delete from app_user where id=any($1::uuid[])',[[owner,peer]]);}finally{await admin.end();}
    }
   }
  }
 }
}
console.log(JSON.stringify({...receipt,fixtureAccountsRowsContainersPublicCaAndInternalNetworkCleaned:true}));
