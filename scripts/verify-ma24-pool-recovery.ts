import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Client} from 'pg';
import {getPool,query,tenantQuery,transaction} from '../src/lib/rag/db';

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_DISPOSABLE_POOL_RECOVERY,'1','Dedicated disposable-cluster harness required');
const appUrl=new URL(process.env.DATABASE_URL!),adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);
assert(['127.0.0.1','localhost'].includes(adminUrl.hostname));assert.equal(appUrl.host+appUrl.pathname,adminUrl.host+adminUrl.pathname);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
function deadline<T>(promise:Promise<T>){
 let timer:ReturnType<typeof setTimeout>;
 return Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Disconnect observation timed out')),10000);})]).finally(()=>clearTimeout(timer));
}
const terminate=async(pid:number)=>{
 const rows=await admin.query('select pg_terminate_backend(pid) terminated from pg_stat_activity where pid=$1 and datname=current_database() and usename=$2',[pid,decodeURIComponent(appUrl.username)]);
 assert.equal(rows.rows[0]?.terminated,true,'Only the disposable application backend may be terminated');
};
try{
 assert.equal((await admin.query('select count(*)::int n from app_user')).rows[0].n,1);
 await admin.query('create table ma24_pool_recovery_probe(token text primary key)');
 await admin.query('grant select,insert on ma24_pool_recovery_probe to network_copilot_app');
 const pool=getPool(),first=(await query<{pid:number;role:string}>('select pg_backend_pid() pid,current_user role'))[0];
 assert.equal(first.role,'network_copilot_app');assert(pool.idleCount>0);
 console.log(JSON.stringify({poolIdleDisconnectProbe:'started'}));
 const removed=new Promise<void>(done=>pool.once('remove',()=>done()));
 await terminate(first.pid);await deadline(removed);
 const second=(await query<{pid:number;role:string}>('select pg_backend_pid() pid,current_user role'))[0];
 assert.notEqual(second.pid,first.pid);assert.equal(second.role,'network_copilot_app');assert.equal(getPool(),pool);
 const disconnectedTokens:string[]=[];
 for(const duringQuery of [false,true]){
  const token=randomUUID();disconnectedTokens.push(token);let attempts=0;
  await assert.rejects(transaction(async client=>{
   attempts++;await client.query('insert into ma24_pool_recovery_probe(token) values($1)',[token]);
   const pid=(await client.query('select pg_backend_pid() pid')).rows[0].pid as number;
   if(duringQuery){
    const sleeping=client.query('select pg_sleep(20)');void sleeping.catch(()=>undefined);
    await terminate(pid);await sleeping;
   }else{
    const ended=new Promise<void>(done=>client.once('end',()=>done()));
    await terminate(pid);await deadline(ended);
   }
   return 'must not commit';
  }),error=>error instanceof Error&&(error as Error&{code?:string}).code==='57P01');
  assert.equal(attempts,1,'Disconnected transaction must never replay automatically');
  assert.equal((await query<{n:number}>('select count(*)::int n from ma24_pool_recovery_probe where token=$1',[token]))[0].n,0);
 }
 const committed=randomUUID();let executions=0;
 await transaction(async client=>{executions++;await client.query('insert into ma24_pool_recovery_probe(token) values($1)',[committed]);});
 assert.equal(executions,1);
 assert.equal((await query<{n:number}>('select count(*)::int n from ma24_pool_recovery_probe'))[0].n,1);
 for(const owner of [randomUUID(),randomUUID()]){
  const scoped=(await tenantQuery<{owner:string;role:string}>(owner,"select current_setting('app.current_user_id') owner,current_user role"))[0];
  assert.equal(scoped.owner,owner);assert.equal(scoped.role,'network_copilot_app');
 }
 const outside=(await query<{owner:string|null}>("select current_setting('app.current_user_id',true) owner"))[0];assert(!outside.owner);
 console.log(JSON.stringify({poolRecoveryDatabase:'passed',idleDisconnectRecovered:true,checkedOutAndQueryDisconnectRecovered:true,
  originalSqlstatePreserved:true,automaticTransactionRetries:0,rolledBackDisconnectedWrites:disconnectedTokens.length,
  subsequentWriteCommittedOnce:true,tenantScopeReinjected:true,realModelCalls:0}));
}finally{await getPool().end();await admin.end();}
