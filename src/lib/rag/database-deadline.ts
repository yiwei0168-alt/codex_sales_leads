import {performance} from 'node:perf_hooks';

export interface DatabaseDeadline {signal:AbortSignal;remainingMs:()=>number}
export function databaseDeadline(milliseconds:number):DatabaseDeadline{
 if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>2_147_483_647)throw new Error('Invalid database deadline');
 const until=performance.now()+milliseconds;
 return {signal:AbortSignal.timeout(milliseconds),remainingMs:()=>Math.max(0,Math.floor(until-performance.now()))};
}
export function databaseDeadlineError(){
 return Object.assign(new Error('Database operation deadline exceeded'),{code:'DATABASE_DEADLINE_EXCEEDED'});
}
export function assertDatabaseDeadline(deadline?:DatabaseDeadline){
 if(deadline&&(deadline.signal.aborted||deadline.remainingMs()<=0))throw databaseDeadlineError();
}
/** Observe late rejection and dispose late acquisitions; never replay work. */
export function awaitDatabaseDeadline<T>(pending:Promise<T>,deadline?:DatabaseDeadline,onLate?:(value:T)=>void):Promise<T>{
 if(!deadline)return pending;
 return new Promise((resolve,reject)=>{
  let ended=false;
  const abort=()=>{if(ended)return;ended=true;deadline.signal.removeEventListener('abort',abort);reject(databaseDeadlineError());};
  deadline.signal.addEventListener('abort',abort,{once:true});
  if(deadline.signal.aborted||deadline.remainingMs()<=0)abort();
  pending.then(value=>{
   if(ended){onLate?.(value);return;}
   ended=true;deadline.signal.removeEventListener('abort',abort);resolve(value);
  },error=>{if(!ended){ended=true;deadline.signal.removeEventListener('abort',abort);reject(error);}});
 });
}
