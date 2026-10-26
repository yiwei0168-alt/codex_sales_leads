import {setTimeout as sleep} from 'node:timers/promises';

const transientCodes=new Set(['DATABASE_DEADLINE_EXCEEDED','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','57P01','57P02','57P03','53300','55P03','57014','08000','08001','08003','08006']);
export async function recoverWorkerPoll<T>(poll:()=>Promise<T>,options:{once:boolean;signal:AbortSignal;
 onFailure:(failure:{reason:string;attempt:number;retryAfterMs:number})=>void;
 wait?:(ms:number,signal:AbortSignal)=>Promise<void>}):Promise<{stopped:true}|{stopped:false;value:T}>{
 const wait=options.wait??(async(ms,signal)=>{await sleep(ms,undefined,{signal});});let attempt=0;
 while(!options.signal.aborted){
  try{return {stopped:false,value:await poll()};}
  catch(error){
   const reason=typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'';
   // Configuration, TLS trust and programming errors still fail visibly.
   if(options.once||!transientCodes.has(reason))throw error;
   if(options.signal.aborted)return {stopped:true};
   const retryAfterMs=Math.min(30_000,2000*2**Math.min(attempt,4));attempt++;
   options.onFailure({reason,attempt,retryAfterMs});
   try{await wait(retryAfterMs,options.signal);}catch(error){if(!options.signal.aborted)throw error;}
  }
 }
 return {stopped:true};
}
