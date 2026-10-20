import {performance} from 'node:perf_hooks';
import {tenantQuery,withDatabaseDeadline} from '@/lib/rag/db';
import {databaseDeadline} from '@/lib/rag/database-deadline';
import {boundary,heartbeat} from './repository';
import type {ExecutionContext} from './contracts';

/** Ordinary task lease/heartbeat API, with a conservative monotonic local cap.
 * The candidate's separate private lease still fences its checkpoint journal. */
export async function withSkillRuntimeTaskLease<T>(context:ExecutionContext,work:(signal:AbortSignal)=>Promise<T>){
 const started=performance.now();
 const row=(await tenantQuery<{remaining_ms:number}>(context.userId,`select floor(extract(epoch from(lease_until-clock_timestamp()))*1000)::integer remaining_ms
  from agent_run where id=$1 and user_id=$2 and lease_token=$3 and status='running' and control is null and lease_until>clock_timestamp()`,
 [context.runId,context.userId,context.leaseToken],undefined,databaseDeadline(20_000)))[0];
 if(!row)throw new Error('Skill runtime task lease unavailable');
 const controller=new AbortController();let active=true,pending=false,deadline:ReturnType<typeof setTimeout>|undefined;
 const lost=()=>controller.abort(new Error('Skill runtime task lease lost or controlled'));
 const arm=(at:number,remaining:number)=>{clearTimeout(deadline);const ms=Math.floor(at+Math.min(90_000,remaining)-performance.now());if(ms<=0)lost();else deadline=setTimeout(lost,ms);};
 arm(started,row.remaining_ms);
 const timer=setInterval(()=>{
  if(!active||pending||controller.signal.aborted)return;pending=true;const at=performance.now();
  void withDatabaseDeadline(databaseDeadline(20_000),async()=>{
   const current=await boundary(context);if(current.control)return false;return heartbeat(context);
  }).then(alive=>{if(active){if(alive)arm(at,90_000);else lost();}}).catch(lost).finally(()=>{pending=false;});
 },20_000);
 try{controller.signal.throwIfAborted();return await work(controller.signal);}
 finally{active=false;clearInterval(timer);clearTimeout(deadline);controller.abort();}
}
