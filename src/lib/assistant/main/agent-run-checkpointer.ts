import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import type {Pool} from 'pg';
import {checkpointTransactionPool} from './checkpoint-transaction-pool';
import {getPool,tenantTransaction} from '@/lib/rag/db';
import {databaseDeadline} from '@/lib/rag/database-deadline';
import {boundary,LeaseLostError} from './repository';
import type {ExecutionContext} from './contracts';

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
   const value=await work(new PostgresSaver(checkpointTransactionPool(this.sharedPool,client),this.serde,{schema:'langgraph'}));
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
