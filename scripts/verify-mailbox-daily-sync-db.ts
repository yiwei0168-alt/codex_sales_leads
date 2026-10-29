import nextEnv from '@next/env';import pg from 'pg';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {linkImportedCustomerMail} from '../src/lib/mailbox/customer-auto-link';
nextEnv.loadEnvConfig(process.cwd());
const c=new pg.Client({connectionString:process.env.DATABASE_MIGRATION_URL});await c.connect();
const owner=randomUUID(),other=randomUUID(),connection=randomUUID(),otherConnection=randomUUID(),customer=randomUUID(),message=randomUUID();
try{
 await c.query('begin');await c.query(await readFile('db/migrations/172_mailbox_daily_sync.sql','utf8'));
 for(const id of [owner,other])await c.query("insert into app_user(id,email,display_name,status,role) values($1,$2,'Daily sync fixture','active','member')",[id,`${id}@fixture.invalid`]);
 for(const [id,user] of [[connection,owner],[otherConnection,other]])await c.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic connection','synthetic-never-decrypted')",[id,user,`${user}@fixture.invalid`]);
 await c.query("insert into mailbox_daily_sync(connection_id,user_id,enabled,next_run_at) values($1,$2,true,((now() at time zone 'Asia/Shanghai')::date-2+time '08:00') at time zone 'Asia/Shanghai'),($3,$4,false,now()-interval '1 day')",[connection,owner,otherConnection,other]);
 await c.query('select enqueue_due_mailbox_daily_sync()');
 let jobs=(await c.query("select id,payload from mailbox_work_job where user_id=$1 and kind='sync'",[owner])).rows;assert.equal(jobs.length,1);
 assert.equal(jobs[0].payload.folderScope,'both');assert.equal(jobs[0].payload.timeZone,'Asia/Shanghai');assert.equal(jobs[0].payload.from,jobs[0].payload.through);
 await c.query('select enqueue_due_mailbox_daily_sync()');assert.equal((await c.query('select count(*)::int n from mailbox_work_job where user_id=$1',[owner])).rows[0].n,1);
 await c.query("update mailbox_work_job set status='completed' where id=$1",[jobs[0].id]);await c.query('select enqueue_due_mailbox_daily_sync()');
 jobs=(await c.query('select payload from mailbox_work_job where user_id=$1 order by created_at,id',[owner])).rows;assert.equal(jobs.length,2);
 assert.equal(new Set(jobs.map(j=>j.payload.from)).size,2);assert.equal((await c.query('select count(*)::int n from mailbox_work_job where user_id=$1',[other])).rows[0].n,0);
 await c.query("insert into mailbox_customer(id,user_id,identity_key,name,domain,confirmed,customer_type) values($1,$2,'domain:customer.invalid','Fixture','customer.invalid',false,'partner')",[customer,owner]);
 await c.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_ciphertext,content_sha256)
  values($1,$2,$3,'INBOX','1',1,'inbound','synthetic-ciphertext',$4)`,[message,owner,connection,'a'.repeat(64)]);
 await c.query('set local role network_copilot_app');await c.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
 assert.equal((await c.query('select count(*)::int n from mailbox_daily_sync')).rows[0].n,1);
 await linkImportedCustomerMail(c as unknown as pg.PoolClient,owner,message,['sender@mail.customer.invalid'],'owner@fixture.invalid');
 assert.equal((await c.query('select count(*)::int n from mailbox_customer_message where message_id=$1',[message])).rows[0].n,1);
 await c.query("update mailbox_customer_message set source='rejected' where message_id=$1",[message]);
 await linkImportedCustomerMail(c as unknown as pg.PoolClient,owner,message,['sender@customer.invalid'],'owner@fixture.invalid');
 assert.equal((await c.query('select source from mailbox_customer_message where message_id=$1',[message])).rows[0].source,'rejected');
 await c.query("select set_config('app.current_user_id',$1,true)",[other]);assert.equal((await c.query('select count(*)::int n from mailbox_customer_message')).rows[0].n,0);
 console.log(JSON.stringify({migration:'172',schedulerFrozenDays:true,activeSyncDeduplicated:true,missedDaysRetained:true,disabledSkipped:true,tenantIsolation:true,rejectedLinkPreserved:true,rolledBack:true,modelCalls:0,mailNetworkCalls:0}));
}finally{await c.query('rollback');await c.end();}
