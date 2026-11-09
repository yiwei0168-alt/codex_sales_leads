/** Prospective batch protection. No network retries or charge inferences. */
export class PaymentRequiredStop extends Error {
 constructor(key){super(`HTTP 402 in ${key}; remaining batch not submitted. Restore provider credit capacity before a newly registered run.`);this.name='PaymentRequiredStop';this.key=key;}
}
export function assertNoPaymentRequired(key,trace){
 if(!Array.isArray(trace?.wire))throw Error(`Missing wire evidence for ${key}`);
 if(trace.wire.some(w=>w.status===402))throw new PaymentRequiredStop(key);
}
/** readSaved returns both observation and original trace, or null.
 * All saved outcomes are preflighted before any new submission, including later
 * schedule entries. submit persists the claim/observation before returning trace.
 * An uncertain or failed submit propagates; it is never automatically reissued.
 */
export async function runGuardedBatch(keys,{readSaved,submit}){
 if(new Set(keys).size!==keys.length)throw Error('Duplicate batch key');
 const saved=new Map();
 for(const key of keys){const prior=await readSaved(key);if(prior){assertNoPaymentRequired(key,prior.trace);saved.set(key,prior);}}
 const completed=[];
 for(const key of keys){
  if(saved.has(key)){completed.push({key,reused:true});continue;}
  const result=await submit(key);
  assertNoPaymentRequired(key,result.trace);
  completed.push({key,reused:false});
 }
 return completed;
}
