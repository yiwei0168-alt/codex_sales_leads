import {withAgentRunLease,settleControlledAgentRun} from './agent-run-lease';
import type {ExecutionContext} from './contracts';

/** G09 uses the ordinary task lease. Its private candidate lease independently
 * fences model/checkpoint writes; this adapter grants no execution authority. */
export async function withSkillRuntimeTaskLease<T>(context:ExecutionContext,work:(signal:AbortSignal)=>Promise<T>){
 return withAgentRunLease(context,async lease=>{
  try{lease.signal.throwIfAborted();return await work(lease.signal);}
  catch(error){lease.stop();await settleControlledAgentRun(context,lease).catch(()=>false);throw error;}
 });
}
