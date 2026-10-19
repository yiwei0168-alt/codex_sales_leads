import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {startMailboxSyncRun,persistMailboxImport,disconnectMailbox,deleteMailboxConnectionData} from '../src/lib/mailbox/repository';

nextEnv.loadEnvConfig(process.cwd());
const configured=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(configured);
const url=new URL(configured);
assert(['localhost','127.0.0.1','::1'].includes(url.hostname));
const state=JSON.parse(await readFile('tmp/ma11-replay-state.json','utf8'));
assert(/^ma11_replay_[a-f0-9]{12}$/.test(state.database));
url.pathname=`/${state.database}`;
process.env.DATABASE_URL=url.toString();
globalThis.fetch=async()=>{throw new Error('External HTTP disabled for synthetic mailbox admission fixture');};
const pool=new Pool({connectionString:url.toString()});
const owners=[randomUUID(),randomUUID()];
const checks:string[]=[];
try{
  for(const owner of owners)await pool.query(
    "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic mailbox admission','!','member','active')",
    [owner,`${owner}@example.invalid`]);
  const owner=owners[0];
  const connection=async()=>{
    const id=randomUUID();
    await pool.query(`insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext)
      values($1,$2,'alimail-imap',$3,'Synthetic mailbox','synthetic-not-a-credential')`,[id,owner,`${id}@example.invalid`]);
    return id;
  };
  const first=await connection();
  const holder=await pool.connect();
  let pending:Promise<unknown>|undefined;
  try{
    await holder.query('begin');
    const pid=(await holder.query('select pg_backend_pid() as pid')).rows[0].pid;
    await holder.query('select id from mailbox_connection where user_id=$1 and id=$2 for update',[owner,first]);
    pending=startMailboxSyncRun(owner,first).then(()=>({unexpectedSuccess:true}),error=>({error:String(error)}));
    let observed=false;
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      const result=await pool.query(`select count(*)::int n from pg_stat_activity
        where $1=any(pg_blocking_pids(pid)) and query like '%select status from mailbox_connection%'`,[pid]);
      if(result.rows[0].n===1){observed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert(observed,'sync admission must wait on the held connection row');
    await holder.query("update mailbox_connection set status='disabled',credential_ciphertext='' where user_id=$1 and id=$2",[owner,first]);
    await holder.query('commit');
    assert.match(JSON.stringify(await pending),/邮箱连接不存在或已断开/);
    assert.equal((await pool.query('select count(*)::int n from mailbox_sync_run where user_id=$1 and connection_id=$2',[owner,first])).rows[0].n,0);
    checks.push('observed connection-row wait; committed disablement rejects admission without a run');
  }finally{
    await holder.query('rollback');holder.release();if(pending)await pending;
  }
  const active=await connection(),other=await connection();
  const run=await startMailboxSyncRun(owner,active);
  await assert.rejects(disconnectMailbox(owner,active),/同步进行中/);
  await assert.rejects(deleteMailboxConnectionData(owner,active),/请等待邮箱同步结束/);
  checks.push('admitted running sync prevents disconnect and local deletion');
  await assert.rejects(startMailboxSyncRun(owners[1],active),/邮箱连接不存在或已断开/);
  checks.push('foreign owner cannot start a run');
  const concurrent=await Promise.allSettled([startMailboxSyncRun(owner,other),startMailboxSyncRun(owner,other)]);
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(concurrent.filter(result=>result.status==='rejected').length,1);
  checks.push('same-connection concurrent admission has one running winner; separate connection can start');
  const input={userId:owner,connectionId:active,runId:run,messages:[],cursors:[{folderPath:'INBOX',uidValidity:'1',lastUid:7}],folders:1,discovered:0};
  const cursors=async()=>Number((await pool.query('select count(*)::int n from mailbox_sync_cursor where user_id=$1',[owner])).rows[0].n);
  await assert.rejects(persistMailboxImport({...input,connectionId:other}),/邮箱同步任务已结束或不属于此连接/);
  assert.equal(await cursors(),0);
  await pool.query("update mailbox_sync_run set status='cancelled' where user_id=$1 and id=$2",[owner,run]);
  await assert.rejects(persistMailboxImport(input),/邮箱同步任务已结束或不属于此连接/);
  assert.equal(await cursors(),0);
  checks.push('wrong-connection and cancelled-run imports reject without advancing any cursor');
  await pool.query("update mailbox_sync_run set status='running' where user_id=$1 and id=$2",[owner,run]);
  await pool.query("update mailbox_connection set status='disabled' where user_id=$1 and id=$2",[owner,active]);
  await assert.rejects(persistMailboxImport(input),/邮箱连接不存在或已断开/);
  assert.equal(await cursors(),0);
  checks.push('disabled connection cannot import even with an existing running run');
  await pool.query("update mailbox_connection set status='active' where user_id=$1 and id=$2",[owner,active]);
  assert.deepEqual(await persistMailboxImport(input),{imported:0,skipped:0,storedMessages:[]});
  assert.equal((await pool.query('select last_uid::text from mailbox_sync_cursor where user_id=$1 and connection_id=$2',[owner,active])).rows[0].last_uid,'7');
  checks.push('valid owned running import advances its cursor');
  await pool.query("update mailbox_sync_run set status='completed' where user_id=$1 and id=$2",[owner,run]);
  assert.equal(await disconnectMailbox(owner,active),true);
  await assert.rejects(startMailboxSyncRun(owner,active),/邮箱连接不存在或已断开/);
  checks.push('completed run allows disconnect; later sync admission rejects');
}finally{
  for(const owner of owners)await pool.query('delete from app_user where id=$1',[owner]);
  await pool.end();await getPool().end();
}
const result={passed:true,checks,syntheticAccounts:true,actualImapConnections:0,actualModelCalls:0,fixtureCleanupCompleted:true};
await writeFile('tmp/ma24-mailbox-sync-admission-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
