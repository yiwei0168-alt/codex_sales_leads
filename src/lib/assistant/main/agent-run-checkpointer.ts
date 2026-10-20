import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import type {Pool,PoolClient} from 'pg';
import {getPool,tenantTransaction} from '@/lib/rag/db';
import {databaseDeadline} from '@/lib/rag/database-deadline';
import {boundary,LeaseLostError} from './repository';
import type {ExecutionContext} from './contracts';

/** The installed saver starts/commits its own transactions. Its scoped adapter
 * keeps those writes on the tenant transaction's client instead, so the task
 * lock, checkpoint blobs/writes, and final lease check commit or roll back together. */
function transactionPool(pool:Pool,client:PoolClient):Pool{
 const scopedClient=new Proxy(client,{get(target,key){
  if(key==='release')return ()=>{};
  if(key==='query')return (...args:unknown[])=>{
   if(typeof args[0]==='string'&&['BEGIN','COMMIT','ROLLBACK'].includes(args[0].trim().toUpperCase()))
    return Promise.resolve({rows:[],rowCount:0,command:'',fields:[],oid:0});
   return Reflect.apply(target.query,target,args);
  };
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return new Proxy(pool,{get(target,key){
  if(key==='connect')return async(...args:unknown[])=>{if(args.length)throw new Error('Checkpoint connection callbacks unavailable');return scopedClient;};
  if(key==='query')return (...args:unknown[])=>Reflect.apply(client.query,client,args);
  if(key==='end')return async()=>{throw new Error('Checkpoint adapter does not own the pool');};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}

/** Task-scoped ordinary graph storage. No schema or checkpoint-format changes;
 * the original PostgresSaver still serializes every checkpoint and pending write. */
export class AgentRunCheckpointer extends PostgresSaver{
 constructor(private readonly context:ExecutionContext,private readonly sharedPool:Pool=getPool()){
  super(sharedPool,undefined,{schema:'langgraph'});
 }
 private assertThread(config:Parameters<PostgresSaver['put']>[0]){
  if(config.configurable?.thread_id!==`main-agent:${this.context.userId}:${this.context.runId}`)
   throw new Error('Checkpoint task identity changed');
 }
 private async write<T>(work:(saver:PostgresSaver)=>Promise<T>){
  return tenantTransaction(this.context.userId,async client=>{
   const args=[this.context.userId,this.context.runId,this.context.leaseToken];
   const locked=await client.query('select id from agent_run where user_id=$1 and id=$2 and lease_token=$3 for share',args);
   if(!locked.rowCount)throw new LeaseLostError();
   const current=async()=>{
    const live=await client.query(`select r.id from agent_run r join app_user u on u.id=r.user_id
     where r.user_id=$1 and r.id=$2 and r.lease_token=$3 and r.status='running' and r.execution_kind='main-agent'
      and r.lease_until>clock_timestamp() and u.status='active'`,args);
    if(!live.rowCount)throw new LeaseLostError();
   };
   // Controls may be pending while the graph records its paused/cancelled state.
   // This grants storage authority only; business calls retain their control checks.
   await current();
   const value=await work(new PostgresSaver(transactionPool(this.sharedPool,client),this.serde,{schema:'langgraph'}));
   await current();return value;
  },this.context.role,databaseDeadline(20_000));
 }
 override async put(...args:Parameters<PostgresSaver['put']>){
  this.assertThread(args[0]);return this.write(saver=>saver.put(...args));
 }
 override async putWrites(...args:Parameters<PostgresSaver['putWrites']>){
  this.assertThread(args[0]);return this.write(saver=>saver.putWrites(...args));
 }
 override async getTuple(...args:Parameters<PostgresSaver['getTuple']>){
  this.assertThread(args[0]);await boundary(this.context);const value=await super.getTuple(...args);await boundary(this.context);return value;
 }
 override async *list(...args:Parameters<PostgresSaver['list']>){
  this.assertThread(args[0]);await boundary(this.context);
  for await(const value of super.list(...args)){await boundary(this.context);yield value;}
 }
 override async deleteThread(threadId:string){
  this.assertThread({configurable:{thread_id:threadId}});return this.write(saver=>saver.deleteThread(threadId));
 }
}
