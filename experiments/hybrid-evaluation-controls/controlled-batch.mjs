import {access} from 'node:fs/promises';
import {assertNoPaymentRequired} from './guarded-batch.mjs';

export class BatchStopped extends Error {
 constructor(reason,completed){super(`Evaluation batch stopped: ${reason}; no new task submitted.`);this.name='BatchStopped';this.reason=reason;this.completed=completed;}
}
/** A separate runtime control file does not mutate frozen source or an in-flight task. */
export async function fileStopRequested(path){
 try{await access(path);return true;}catch(e){if(e?.code==='ENOENT')return false;throw e;}
}
export function hasTransportFailure(trace){
 return trace?.wire?.some(w=>w.error==='transport-failure')===true
  ||trace?.calls?.some(c=>c.tool_id==='main_model'&&c.output?.status!=='success'&&c.metrics?.failureDiagnostic?.transport)===true;
}
/** Freeze the failure threshold before a new run. Stops invalidate qualification;
 * they never remove failed tasks, resume claims, retry requests or infer zero cost.
 */
export async function runControlledBatch(keys,{readSaved,submit,stopRequested,maximumConsecutiveTransportFailures=2}){
 if(new Set(keys).size!==keys.length)throw Error('Duplicate batch key');
 if(!Number.isSafeInteger(maximumConsecutiveTransportFailures)||maximumConsecutiveTransportFailures<1)throw Error('Invalid failure threshold');
 const saved=new Map(),completed=[];let failures=0;
 for(const key of keys){const previous=await readSaved(key);if(previous){assertNoPaymentRequired(key,previous.trace);saved.set(key,previous);}}
 for(const key of keys){
  if(await stopRequested())throw new BatchStopped('operator-stop',completed);
  if(failures>=maximumConsecutiveTransportFailures)throw new BatchStopped('consecutive-transport-failures',completed);
  const reused=saved.has(key);
  const outcome=reused?saved.get(key):await submit(key);
  // submit must finish persistence before resolving. No cancellation races with
  // its provider requests: a stop received during it is honored on next iteration.
  completed.push({key,reused});
  assertNoPaymentRequired(key,outcome.trace);
  failures=hasTransportFailure(outcome.trace)?failures+1:0;
 }
 return completed;
}
