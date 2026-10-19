import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {build} from 'esbuild';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {encryptMailboxCredential,decryptMailboxContent} from '../src/lib/mailbox/crypto';
import {enqueueSync} from '../src/lib/mailbox/work-queue';
import {startMailboxSyncRun,persistMailboxImport,completeMailboxImport,failMailboxSyncRun} from '../src/lib/mailbox/repository';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(configured);
const url=new URL(configured);assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));url.pathname=`/${state.database}`;
process.env.DATABASE_URL=url.toString();process.env.MAILBOX_CREDENTIAL_KEY=randomBytes(32).toString('base64url');
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for synthetic mailbox recovery');};
const pool=new Pool({connectionString:url.toString()}),owner=randomUUID(),connection=randomUUID();
const checks:string[]=[],children:Array<{child:ChildProcess;done:Promise<number|null>}> = [];
const directory=resolve('tmp',`ma24-mailbox-worker-${owner}`),entry=resolve(directory,'worker.cjs');
const worker=()=>{
  const child=spawn(process.execPath,[entry],{env:{...process.env},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='';child.stdout?.on('data',data=>{output+=String(data);});child.stderr?.on('data',data=>{output+=String(data);});
  const done=new Promise<number|null>((accept,reject)=>{child.once('error',reject);child.once('exit',accept);});
  children.push({child,done});
  return {child,done,output:()=>output};
};
try{
  const migration=await readFile('db/migrations/153_mailbox_sync_worker_binding.sql','utf8');
  await pool.query(migration);await pool.query(migration);
  // The real claim function scans the queue: refuse to touch a clone with other live jobs.
  assert.equal((await pool.query("select count(*)::int n from mailbox_work_job where status in ('queued','running')")).rows[0].n,0,'clone must have no unrelated claimable/running mailbox jobs');
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic recovery','!','member','active')",[owner,`${owner}@example.invalid`]);
  await pool.query(`insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext)
    values($1,$2,'alimail-imap',$3,'Synthetic recovery',$4)`,[connection,owner,`${connection}@example.invalid`,encryptMailboxCredential('synthetic-password')]);
  const {jobId}=await enqueueSync(owner,{connectionId:connection,folderScope:'inbox',from:'2026-10-01',through:'2026-10-19',maxMessages:1});
  await mkdir(directory,{recursive:true});
  await build({stdin:{contents:`import {processMailboxWork} from ${JSON.stringify(resolve('src/lib/mailbox/work-queue.ts'))};
    import {getPool} from ${JSON.stringify(resolve('src/lib/rag/db.ts'))};
    globalThis.fetch=async()=>{throw new Error('External HTTP disabled in synthetic worker');};
    processMailboxWork().then(()=>getPool().end()).catch(error=>{console.error(error);process.exitCode=1;});`,resolveDir:process.cwd(),sourcefile:'synthetic-worker.ts'},
    outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'synthetic-imap-only',setup(builder){
      builder.onLoad({filter:/[\\/]mailbox[\\/]alimail-imap\.ts$/},async()=>({contents:await readFile('scripts/fixtures/ma24-mailbox-recovery-imap.ts','utf8'),loader:'ts',resolveDir:resolve('scripts/fixtures')}));
    }}]});
  process.env.MA24_SYNTHETIC_MAILBOX_HOLD='1';
  const interrupted=worker();let held:Record<string,string>|undefined;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    held=(await pool.query("select id,work_lease_token from mailbox_sync_run where user_id=$1 and current_subject='ma24-synthetic-hold' and status='running'",[owner])).rows[0];
    if(held)break;
    if(interrupted.child.exitCode!==null)throw new Error(`Worker exited before hold: ${interrupted.output()}`);
    await new Promise(accept=>setTimeout(accept,50));
  }
  assert(held,'first worker must commit one page and hold the next batch');
  assert.equal((await pool.query('select count(*)::int n from mailbox_message where user_id=$1',[owner])).rows[0].n,1);
  interrupted.child.kill('SIGKILL');await interrupted.done;
  checks.push('actual worker process killed after first committed page and next running batch');
  await pool.query("update mailbox_work_job set lease_until=clock_timestamp()-interval '1 second' where user_id=$1 and id=$2",[owner,jobId]);
  const oldLease={jobId,leaseToken:held.work_lease_token};
  await assert.rejects(startMailboxSyncRun(owner,connection,undefined,oldLease),/Worker 租约已失效/);
  await assert.rejects(persistMailboxImport({userId:owner,connectionId:connection,runId:held.id,workerLease:oldLease,messages:[],cursors:[{folderPath:'INBOX',uidValidity:'1',lastUid:999}],folders:1,discovered:0}),/Worker 租约已失效/);
  await assert.rejects(completeMailboxImport(held.id,owner,0),/Worker 租约已失效/);
  checks.push('expired worker cannot start, import/advance cursor, or complete its held run');
  process.env.MA24_SYNTHETIC_MAILBOX_HOLD='0';
  const recovered=worker();
  const timer=setTimeout(()=>recovered.child.kill('SIGKILL'),20000);
  try{assert.equal(await recovered.done,0,recovered.output());}finally{clearTimeout(timer);}
  const job=(await pool.query('select status,payload,result,lease_token from mailbox_work_job where user_id=$1 and id=$2',[owner,jobId])).rows[0];
  assert.equal(job.status,'completed');assert.notEqual(job.lease_token,oldLease.leaseToken);
  assert.deepEqual(job.result,{imported:3,processed:3,discovered:3,remaining:0});
  assert.equal(job.payload.from,'2026-10-01');assert.equal(job.payload.through,'2026-10-19');
  const messages=(await pool.query('select message_uid::int uid,subject,body_text,content_ciphertext from mailbox_message where user_id=$1 order by message_uid',[owner])).rows;
  assert.deepEqual(messages.map(row=>row.uid),[1,2,3]);
  for(const message of messages){assert.equal(message.subject,'');assert.equal(message.body_text,'');assert.match(decryptMailboxContent(owner,message.content_ciphertext).bodyText,/Synthetic mailbox recovery message/);}
  assert.equal((await pool.query('select count(*)::int n from mailbox_sync_cursor where user_id=$1',[owner])).rows[0].n,0);
  assert.equal((await pool.query('select status from mailbox_sync_run where user_id=$1 and id=$2',[owner,held.id])).rows[0].status,'cancelled');
  await failMailboxSyncRun(held.id,owner,'late synthetic failure');
  await assert.rejects(completeMailboxImport(held.id,owner,0),/已结束/);
  assert.equal((await pool.query('select status from mailbox_sync_run where user_id=$1 and id=$2',[owner,held.id])).rows[0].status,'cancelled');
  await assert.rejects(startMailboxSyncRun(owner,connection,undefined,oldLease),/Worker 租约已失效/);
  checks.push('real claim function replaces expired lease; recovered worker cancels only its prior batch and completes frozen-range pages');
  checks.push('three unique encrypted messages retained, first committed page not duplicated; custom range does not change global cursors');
  checks.push('late old-worker completion/failure cannot overwrite the cancelled run');
}finally{
  for(const running of children){if(running.child.exitCode===null&&running.child.signalCode===null)running.child.kill('SIGKILL');await running.done;}
  await pool.query('delete from mailbox_message where user_id=$1',[owner]);
  await pool.query('delete from mailbox_sync_run where user_id=$1',[owner]);
  await pool.query('delete from mailbox_work_job where user_id=$1',[owner]);
  await pool.query('delete from app_user where id=$1',[owner]);
  await pool.end();await getPool().end();
}
const result={passed:true,checks,migration:153,migrationIdempotence:true,actualWorkerKills:1,actualImapCalls:0,actualModelCalls:0,syntheticImapAdapter:true,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-mailbox-worker-recovery-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
