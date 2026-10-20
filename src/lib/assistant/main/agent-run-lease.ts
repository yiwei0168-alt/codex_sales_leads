import {performance} from 'node:perf_hooks';
import {tenantQuery,withDatabaseDeadline} from '@/lib/rag/db';
import {databaseDeadline} from '@/lib/rag/database-deadline';
import {boundary,heartbeat,finishRun} from './repository';
import type {ExecutionContext} from './contracts';

export type AgentRunLease={signal:AbortSignal;remainingMs:()=>number;stop:()=>void};

/** Shared ordinary/G09 task lease. Confirm before I/O, never extend the local
 * safe window using time spent waiting for a database response. */
export async function withAgentRunLease<T>(context:ExecutionContext,work:(lease:AgentRunLease)=>Promise<T>){
 const started=performance.now();
 const row=(await tenantQuery<{remaining_ms:number;control:'pause'|'cancel'|null}>(context.userId,
  `select floor(extract(epoch from(r.lease_until-clock_timestamp()))*1000)::integer remaining_ms,r.control
   from agent_run r join app_user u on u.id=r.user_id
   where r.id=$1 and r.user_id=$2 and r.lease_token=$3 and r.status='running'
    and u.status='active' and r.lease_until>clock_timestamp()`,
 [context.runId,context.userId,context.leaseToken],undefined,databaseDeadline(20_000)))[0];
 if(!row||!Number.isSafeInteger(row.remaining_ms)||row.remaining_ms<=0)throw new Error('Agent run lease unavailable');
 const controller=new AbortController();let active=true,pending=false,until=started,deadline:ReturnType<typeof setTimeout>|undefined;
 const remainingMs=()=>Math.max(0,Math.floor(until-performance.now()));
 const lost=()=>controller.abort(new Error('Agent run lease lost or controlled'));
 const arm=(at:number,remaining:number)=>{
  if(controller.signal.aborted||!active)return;
  until=at+Math.min(90_000,remaining);clearTimeout(deadline);
  const ms=remainingMs();if(ms<=0)lost();else deadline=setTimeout(lost,ms);
 };
 arm(started,row.remaining_ms);if(row.control)lost();
 const timer=setInterval(()=>{
  if(!active||pending||controller.signal.aborted)return;pending=true;const at=performance.now();
  void withDatabaseDeadline(databaseDeadline(20_000),async()=>{
   const current=await boundary(context);if(current.control)return false;return heartbeat(context);
  }).then(alive=>{if(active&&!controller.signal.aborted){if(alive)arm(at,90_000);else lost();}})
   .catch(()=>{if(active)lost();}).finally(()=>{pending=false;});
 },20_000);
 const stop=()=>{active=false;clearInterval(timer);clearTimeout(deadline);controller.abort();};
 try{return await work({signal:controller.signal,remainingMs,stop});}finally{stop();}
}

/** Only settle an observed current control under the same lease. Keep any
 * existing partial reply; ordinary/evaluation message policies remain in finishRun. */
export async function settleControlledAgentRun(context:ExecutionContext,lease:AgentRunLease){
 const remaining=lease.remainingMs();if(remaining<=0)return false;
 return withDatabaseDeadline(databaseDeadline(Math.min(20_000,remaining)),async()=>{
  const current=await boundary(context);if(!current.control)return false;
  await finishRun(context,'partial',typeof current.result?.reply==='string'?current.result.reply:'');return true;
 });
}
