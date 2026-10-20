import {Pool} from 'pg';
import {z} from 'zod';
import {databaseConnectionString,databaseSslConfiguration,isRemoteDatabase} from '@/lib/rag/database-ssl';
import {assertSkillCollector,type SkillCollectorTransaction} from './skill-model-journal';

/** Dedicated collector login only. Never use the migration/admin or application
 * connection to exercise collector grants in an actual runner process. */
export function createConfiguredSkillCollectorConnection(){
 const source=process.env.SKILL_COLLECTOR_DATABASE_URL,application=process.env.DATABASE_URL;
 if(!source||!application)throw new Error('Separate collector and application database URLs required');
 const url=new URL(source),app=new URL(application);
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.host!==app.host||url.pathname!==app.pathname
  ||url.username===app.username||['postgres','network_copilot_app','network_copilot_skill_collector'].includes(decodeURIComponent(url.username)))
  throw new Error('Dedicated collector login targeting the application database required');
 if(isRemoteDatabase(source)&&url.searchParams.get('sslmode')!=='verify-full')throw new Error('Remote collector requires verified TLS');
 const pool=new Pool({connectionString:databaseConnectionString(source),ssl:databaseSslConfiguration(source),max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
 // Execution ownership must not occupy the journal pool: concurrent arms must
 // retain independent capacity to commit their model attempt/outcome receipts.
 const executionPool=new Pool({connectionString:databaseConnectionString(source),ssl:databaseSslConfiguration(source),max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
 let idleFailure=false;for(const current of [pool,executionPool])current.on('error',()=>{idleFailure=true;});
 const createTransaction=(channel:Pool):SkillCollectorTransaction=>async(ownerId,work)=>{
  z.uuid().parse(ownerId);if(idleFailure)throw new Error('Collector connection failed; restart and reconcile');
  const client=await channel.connect();let failed=false;
  const onError=()=>{failed=true;};client.on('error',onError);
  try{
   await client.query('begin');
   const state=(await client.query<{unsafe:boolean;collector:boolean;application:boolean;tls:boolean}>(`select
    (r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolinherit or not r.rolcanlogin) as unsafe,
    pg_has_role(session_user,'network_copilot_skill_collector','MEMBER') as collector,
    pg_has_role(session_user,'network_copilot_app','MEMBER') as application,
    coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as tls
    from pg_roles r where r.rolname=session_user`)).rows[0];
   if(!state||state.unsafe||!state.collector||state.application||isRemoteDatabase(source)&&!state.tls)
    throw new Error('Collector login privileges or TLS invalid');
   await client.query('set local role network_copilot_skill_collector');await assertSkillCollector(client);
   await client.query("select set_config('app.current_user_id',$1,true)",[ownerId]);
   const value=await work(client);if(failed)throw new Error('Collector connection interrupted');
   await client.query('commit');return value;
  }catch(error){try{await client.query('rollback');}catch{failed=true;}throw error;
  }finally{client.removeListener('error',onError);client.release(failed);}
 };
 const transaction=createTransaction(pool);transaction.execution=createTransaction(executionPool);
 return {transaction,close:async()=>{await Promise.all([pool.end(),executionPool.end()]);}};
}
