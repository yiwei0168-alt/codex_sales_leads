import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {readDailySync} from '../src/lib/mailbox/daily-sync';
import {getPool} from '../src/lib/rag/db';

const app=new URL(process.env.DATABASE_URL!);
const migration=new URL(process.env.DATABASE_MIGRATION_URL!);
assert.equal(app.host+app.pathname,migration.host+migration.pathname);
assert(['localhost','127.0.0.1'].includes(app.hostname));
assert.match(app.pathname,/^\/ma24_gap_[a-f0-9]{12}$/,'Dedicated disposable database required');
const c=new Client({connectionString:migration.toString()});
await c.connect();
const owner=randomUUID(),peer=randomUUID(),connection=randomUUID(),peerConnection=randomUUID();
try{
 assert.equal(Number((await c.query('select count(*) as n from app_user')).rows[0].n),0);
 for(const id of [owner,peer])await c.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Synthetic gap','!','member','active')",[id,id+'@example.invalid']);
 for(const [id,user] of [[connection,owner],[peerConnection,peer]]){
  await c.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic gap','not-a-credential')",[id,user,user+'@example.invalid']);
  await c.query("insert into mailbox_daily_sync(connection_id,user_id,enabled,next_run_at) values($1,$2,true,now()+interval '1 day')",[id,user]);
 }
 async function job(user:string,target:string,from:string,through:string,status:string,zone='Asia/Shanghai',folder='both',automatic=false,created='2026-11-01T00:00:00Z'){
  return (await c.query(`insert into mailbox_work_job(user_id,kind,target_id,payload,status,created_at,updated_at)
   values($1,'sync',$2,$3,$4,$5,$5) returning id`,[user,target,JSON.stringify({from,through,timeZone:zone,folderScope:folder,automatic}),status,created])).rows[0].id;
 }
 for(const day of ['2026-10-30','2026-10-31','2026-11-01'])await job(owner,connection,day,day,'failed','Asia/Shanghai','both',true);
 await job(owner,connection,'2026-10-30','2026-10-30','failed','Asia/Shanghai','both',true); // Duplicate failures count once.
 const latest=await job(owner,connection,'2026-11-02','2026-11-02','completed');
 await c.query('update mailbox_daily_sync set last_job_id=$1 where connection_id=$2',[latest,connection]);
 let rows=await readDailySync(owner);
 assert.equal(rows.length,1);assert.equal(rows[0].last_status,'completed');assert.equal(rows[0].uncovered_failed_days,3);
 assert.equal(rows[0].first_uncovered_day,'2026-10-30');assert.equal(rows[0].last_uncovered_day,'2026-11-01');
 await job(owner,connection,'2026-10-30','2026-11-01','completed','UTC');
 await job(owner,connection,'2026-10-30','2026-11-01','completed','Asia/Shanghai','inbox');
 await job(peer,peerConnection,'2026-10-30','2026-11-01','completed');
 await job(owner,connection,'2026-10-30','2026-11-01','completed','Asia/Shanghai','both',false,'2026-10-01T00:00:00Z');
 assert.equal((await readDailySync(owner))[0].uncovered_failed_days,3,'Wrong zone, folder, owner or older completion must not hide gaps');
 const partial=await job(owner,connection,'2026-10-30','2026-10-31','queued');
 assert.equal((await readDailySync(owner))[0].uncovered_failed_days,3,'Queued recovery is not complete coverage');
 await c.query("update mailbox_work_job set status='completed',updated_at=now() where id=$1",[partial]);
 rows=await readDailySync(owner);assert.equal(rows[0].uncovered_failed_days,1);assert.equal(rows[0].first_uncovered_day,'2026-11-01');
 await job(owner,connection,'2026-11-01','2026-11-01','completed');
 rows=await readDailySync(owner);assert.equal(rows[0].uncovered_failed_days,0);assert.equal(rows[0].first_uncovered_day,null);assert.equal(rows[0].last_uncovered_day,null);
 const other=await readDailySync(peer);assert.equal(other.length,1);assert.equal(other[0].connection_id,peerConnection);assert.equal(other[0].uncovered_failed_days,0);
 console.log(JSON.stringify({dailyGapDb:'passed',latestSuccessDoesNotHideFailures:true,duplicateDaysCountOnce:true,coverageRequiresMatchingOwnerZoneFoldersAndTime:true,queuedIsNotCoverage:true,partialAndFullRecoveryClearGaps:true,tenantIsolation:true,modelCalls:0,mailNetworkCalls:0}));
}finally{await c.end();await getPool().end();}
