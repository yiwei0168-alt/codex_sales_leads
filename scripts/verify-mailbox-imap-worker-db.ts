import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {build} from 'esbuild';
import {Client} from 'pg';
import {getPool,tenantQuery} from '../src/lib/rag/db';
import {encryptMailboxCredential,decryptMailboxContent} from '../src/lib/mailbox/crypto';
import {enqueueSync} from '../src/lib/mailbox/work-queue';
import {startMa24ImapWireServer,type ImapWireFixtureState} from './lib/ma24-imap-wire-server';

assert.equal(process.env.MA24_DISPOSABLE_MAILBOX_IMAP,'1');
const application=new URL(process.env.DATABASE_URL!),migration=new URL(process.env.DATABASE_MIGRATION_URL!);
assert.equal(application.hostname,'127.0.0.1');assert.equal(application.host+application.pathname,migration.host+migration.pathname);
const owner=randomUUID(),peer=randomUUID(),connection=randomUUID(),directory=resolve('tmp',`ma24-mailbox-imap-${owner}`),entry=resolve(directory,'worker.cjs');
assert(directory.startsWith(resolve('tmp')+sep));
process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
const fixture:ImapWireFixtureState={ca:'',port:0,validity:1,disconnect:true,disconnectFolder:'Sent',commands:[]};
const server=await startMa24ImapWireServer(fixture),admin=new Client({connectionString:migration.toString()});await admin.connect();
const children:Array<{child:ChildProcess;done:Promise<number|null>}> = [];
const pause=(ms:number)=>new Promise(done=>setTimeout(done,ms));
let receipt:Record<string,unknown>|undefined;
try{
 assert.equal((await admin.query("select count(*)::int n from mailbox_work_job where status in ('queued','running')")).rows[0].n,0);
 for(const id of [owner,peer])await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic IMAP Worker','member','active')",[id,`${id}@example.invalid`]);
 await admin.query(`insert into mailbox_connection(id,user_id,provider,email,display_name,host,port,credential_ciphertext)
  values($1,$2,'standard-imap',$3,'Synthetic IMAP Worker','imap.example.invalid',$4,$5)`,[connection,owner,`${connection}@example.invalid`,server.port,encryptMailboxCredential('synthetic-local-only')]);
 const {jobId}=await enqueueSync(owner,{connectionId:connection,folderScope:'both',from:'2026-10-02',through:'2026-10-03',maxMessages:2});
 await mkdir(directory,{recursive:true});const caFile=resolve(directory,'public-ca.crt');await writeFile(caFile,server.ca,{flag:'wx'});
 await build({stdin:{contents:`import {processMailboxWork} from ${JSON.stringify(resolve('src/lib/mailbox/work-queue.ts'))};
  import {getPool} from ${JSON.stringify(resolve('src/lib/rag/db.ts'))};
  globalThis.fetch=async()=>{throw new Error('External HTTP disabled in isolated IMAP Worker');};
  processMailboxWork().then(()=>getPool().end()).catch(error=>{console.error(error);process.exitCode=1;});`,resolveDir:process.cwd(),sourcefile:'isolated-imap-worker.ts'},
  outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-imap-dns-only',setup(builder){
   builder.onLoad({filter:/[\\/]mailbox[\\/]connection-config\.ts$/},async()=>{
    const original=await readFile('src/lib/mailbox/connection-config.ts','utf8'),marker='export async function publicMailAddresses(host: string): Promise<string[]> {';
    assert.equal(original.split(marker).length,2);
    return {contents:original.replace(marker,marker+"\n if(host==='imap.example.invalid')return ['127.0.0.1'];throw new Error('Non-fixture DNS disabled');"),loader:'ts',resolveDir:resolve('src/lib/mailbox')};
   });
  }}]});
 const worker=()=>{
  // Do not inherit provider keys or private production environment into children.
  const env:NodeJS.ProcessEnv={NODE_ENV:'test'};for(const name of ['PATH','SystemRoot','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{DATABASE_URL:application.toString(),MAILBOX_CREDENTIAL_KEY:process.env.MAILBOX_CREDENTIAL_KEY,NODE_EXTRA_CA_CERTS:caFile});
  const child=spawn(process.execPath,[entry],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';
  child.stdout?.on('data',d=>{output+=d;});child.stderr?.on('data',d=>{output+=d;});
  const done=new Promise<number|null>((accept,reject)=>{child.once('error',reject);child.once('exit',accept);});children.push({child,done});
  return {child,done,output:()=>output};
 };
 const interrupted=worker();let held:{id:string;work_lease_token:string}|undefined;
 for(let i=0;i<400;i++){
  held=(await admin.query("select id,work_lease_token from mailbox_sync_run where user_id=$1 and status='running' and processed_count=1 and current_subject='Wire Sent 3'",[owner])).rows[0];
  if(held)break;assert.equal(interrupted.child.exitCode,null,interrupted.output());await pause(50);
 }
 assert(held,'Actual Sent parser must persist first-message progress after first INBOX page commits');
 assert.equal((await admin.query('select count(*)::int n from mailbox_message where user_id=$1',[owner])).rows[0].n,2);
 const originalLease=(await admin.query('select lease_token,lease_until::text from mailbox_work_job where id=$1',[jobId])).rows[0];assert.equal(originalLease.lease_token,held.work_lease_token);
 interrupted.child.kill('SIGKILL');await interrupted.done;
 assert.deepEqual((await admin.query('select lease_token,lease_until::text from mailbox_work_job where id=$1',[jobId])).rows[0],originalLease);
 let expired=false;for(let i=0;i<1000;i++){expired=(await admin.query('select lease_until<clock_timestamp() expired from mailbox_work_job where id=$1',[jobId])).rows[0].expired;if(expired)break;await pause(100);}assert(expired);
 const recovered=worker(),timer=setTimeout(()=>recovered.child.kill('SIGKILL'),30000);
 try{assert.equal(await recovered.done,0,recovered.output());}finally{clearTimeout(timer);}
 const job=(await admin.query('select status,payload,result,lease_token from mailbox_work_job where id=$1',[jobId])).rows[0];
 assert.equal(job.status,'completed');assert.notEqual(job.lease_token,originalLease.lease_token);
 // Live parser progress is not a committed import. Only persisted page counters
 // may contribute to recovered totals, otherwise the half page is double counted.
 assert.deepEqual(job.result,{imported:4,processed:4,discovered:4,remaining:0});
 assert.equal(job.payload.from,'2026-10-02');assert.equal(job.payload.through,'2026-10-03');
 const messages=(await admin.query('select id,folder_path,message_uid::int uid,direction,subject,body_text,content_ciphertext from mailbox_message where user_id=$1 order by folder_path,message_uid',[owner])).rows;
 assert.deepEqual(messages.map(m=>[m.folder_path,m.uid,m.direction]),[['INBOX',2,'inbound'],['INBOX',4,'inbound'],['Sent',3,'outbound'],['Sent',6,'outbound']]);
 for(const message of messages){assert.equal(message.subject,'');assert.equal(message.body_text,'');assert.match(decryptMailboxContent(owner,message.content_ciphertext).bodyText,/Synthetic body/);}
 assert.deepEqual(await tenantQuery(peer,'select id from mailbox_message where id=any($1::uuid[])',[messages.map(m=>m.id)]),[]);
 assert.equal((await admin.query('select count(*)::int n from mailbox_sync_cursor where user_id=$1',[owner])).rows[0].n,0);
 assert.equal((await admin.query('select status from mailbox_sync_run where id=$1',[held.id])).rows[0].status,'cancelled');
 const snapshot=async()=>(await admin.query(`select
  (select jsonb_agg(to_jsonb(j) order by id) from mailbox_work_job j where user_id=$1) jobs,
  (select jsonb_agg(to_jsonb(r) order by id) from mailbox_sync_run r where user_id=$1) runs,
  (select jsonb_agg(to_jsonb(m) order by id) from mailbox_message m where user_id=$1) messages`,[owner])).rows[0];
 const saved=await snapshot(),empty=worker();assert.equal(await empty.done,0,empty.output());assert.deepEqual(await snapshot(),saved);
 assert(fixture.commands.some(c=>/^EXAMINE/.test(c)));assert(fixture.commands.some(c=>/^UID FETCH.*BODY\.PEEK\[/.test(c)));
 assert(!fixture.commands.some(c=>/^(SELECT|APPEND|STORE|EXPUNGE|MOVE|COPY|UID STORE|UID MOVE|UID COPY)\b/i.test(c)));
 receipt={mailboxImapWorker:'passed',actualImapFlowAndMailparser:true,readerUnchanged:true,compiledSourceWorker:true,
  isolatedDnsOverrideOnly:true,tlsVerificationEnabled:true,actualSigkillAfterFirstPageAndPartialNextPage:true,partialPageParsedProgress:1,
  originalLeaseUnchanged:true,recoveredAfterActual90SecondLease:true,newLeaseToken:true,jobResult:job.result,
  uniqueEncryptedMessages:messages.length,customRangeGlobalCursorUnchanged:true,peerReadsRejected:true,heldBatchCancelled:true,
  subsequentEmptyWorkerExactRowsUnchanged:true,realMailboxConnections:0,sentMessages:0,modelCalls:0};
}finally{
 try{for(const running of children){if(running.child.exitCode===null&&running.child.signalCode===null)running.child.kill('SIGKILL');await running.done;}}
 finally{try{await server.close();}finally{
  await getPool().end();try{
   for(const table of ['mailbox_message','mailbox_sync_run','mailbox_work_job'])await admin.query(`delete from ${table} where user_id=$1`,[owner]);
   await admin.query('delete from app_user where id=any($1::uuid[])',[[owner,peer]]);
  }finally{await admin.end();assert(directory.startsWith(resolve('tmp')+sep));await rm(directory,{recursive:true,force:true});}
 }}
}
console.log(JSON.stringify({...receipt,fixtureAccountsRowsChildrenTlsListenerAndPublicCaCleaned:true}));
