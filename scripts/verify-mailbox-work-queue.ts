import nextEnv from '@next/env';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {databaseConnectionString,databaseSslConfiguration} from '../src/lib/rag/database-ssl';
nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL!;
const pool=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)});
const client=await pool.connect();
try{
 await client.query('begin');
 const a=randomUUID(),b=randomUUID(),target=randomUUID();
 for(const id of [a,b])await client.query("insert into app_user(id,email,display_name) values($1,$2,'Synthetic mailbox queue test')",[id,`${id}@example.invalid`]);
 await client.query('set local role network_copilot_app');
 await client.query("select set_config('app.current_user_id',$1,true)",[a]);
 await client.query("insert into mailbox_work_job(user_id,kind,target_id) values($1,'learn',$2)",[a,target]);
 await client.query('savepoint duplicate');
 await assert.rejects(client.query("insert into mailbox_work_job(user_id,kind,target_id) values($1,'learn',$2)",[a,target]),/duplicate key/);
 await client.query('rollback to savepoint duplicate');
 await client.query("select set_config('app.current_user_id',$1,true)",[b]);
 assert.equal((await client.query('select id from mailbox_work_job where user_id=$1',[a])).rowCount,0);
 await client.query('savepoint denied');
 await assert.rejects(client.query("insert into mailbox_work_job(user_id,kind,target_id) values($1,'sync',$2)",[a,randomUUID()]),/row-level security/);
 await client.query('rollback to savepoint denied');
 console.log('PASS: owner isolation, write denial, active-job deduplication; synthetic transaction rolled back.');
}finally{await client.query('rollback');client.release();await pool.end();}
