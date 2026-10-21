import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {lockSkillReadReceiptSources} from '../src/lib/assistant/main/skill-read-source-locks';

nextEnv.loadEnvConfig(process.cwd());assert.equal(process.env.MA24_DISPOSABLE_RUNTIME_READ_SOURCES,'1');
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(app.host+app.pathname,admin.host+admin.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),other=randomUUID(),customer=randomUUID(),foreignCustomer=randomUUID(),mail=randomUUID(),foreignMail=randomUUID();
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1);
 for(const user of [owner,other])await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic read lock','member','active')",[user,`${user}@example.invalid`]);
 for(const [user,customerId,mailId] of [[owner,customer,mail],[other,foreignCustomer,foreignMail]]){
  await pool.query("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$1::uuid::text,'Synthetic private source')",[customerId,user]);
  const connection=randomUUID();
  await pool.query("insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext) values($1,$2,'alimail-imap',$3,'Synthetic source lock','unusable-synthetic')",[connection,user,`${connection}@example.invalid`]);
  await pool.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext)
   values($1,$2,$3,'Synthetic','1',1,'inbound',$4,'unusable-synthetic')`,[mailId,user,connection,'a'.repeat(64)]);
 }
 assert.equal((await pool.query('select count(*)::int n from agent_run')).rows[0].n,0,'No original task may supply these locks');
 const held=async(receipts:Parameters<typeof lockSkillReadReceiptSources>[2],work:()=>Promise<void>)=>{
  const client=await pool.connect();try{
   await client.query('begin');await client.query('set local role network_copilot_app');
   await client.query("select set_config('app.current_user_id',$1,true)",[owner]);
   const locked=await lockSkillReadReceiptSources(client,owner,receipts);await work();return locked;
  }finally{await client.query('rollback');client.release();}
 };
 const blocked=async(sql:string,args:unknown[])=>{
  const writer=await pool.connect();try{
   await writer.query('begin');await writer.query("set local lock_timeout='200ms'");
   await assert.rejects(writer.query(sql,args),(error:unknown)=>(error as {code?:string}).code==='55P03');
  }finally{await writer.query('rollback');writer.release();}
 };
 const locked=await held([{tool_id:'mail_read',input:{messageId:mail}},{tool_id:'customer_timeline',input:{customerId:customer}}],async()=>{
  await blocked('update mailbox_message set metadata=metadata where id=$1',[mail]);
  await blocked('update mailbox_customer set name=name where id=$1',[customer]);
 });
 assert.equal(locked.mailCount,1);assert.equal(locked.timelineCustomerCount,1);
 assert.equal((await pool.query('update mailbox_message set metadata=metadata where id=$1',[mail])).rowCount,1);
 assert.equal((await pool.query('update mailbox_customer set name=name where id=$1',[customer])).rowCount,1);
 await assert.rejects(held([{tool_id:'mail_read',input:{messageId:foreignMail}}],async()=>{}),/mail source unavailable/);
 await assert.rejects(held([{tool_id:'customer_timeline',input:{customerId:foreignCustomer}}],async()=>{}),/timeline customer unavailable/);
 await assert.rejects(held([{tool_id:'mail_read',input:{messageId:randomUUID()}}],async()=>{}),/mail source unavailable/);
 const added=randomUUID();
 const list=await held([{tool_id:'customer_timeline',input:{}}],async()=>{
  await blocked("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$1::uuid::text,'Synthetic append')",[added,owner]);
 });
 assert.equal(list.timelineCustomerCount,1);
 await pool.query("insert into mailbox_customer(id,user_id,identity_key,name) values($1,$2,$1::uuid::text,'Synthetic append')",[added,owner]);
 console.log(JSON.stringify({runtimeReadSourceLocksDatabase:'passed',privateReadSourcesLockedWithoutOriginalTasks:true,
  mailAndExplicitTimelineUpdatesBlocked:true,wholeAccountListAppendBlocked:true,releaseAllowsWrites:true,
  foreignAndMissingSourcesRejected:true,fullLiveExecutionVerified:false,actualModelCalls:0,businessToolExecutions:0}));
}finally{await pool.end();}
