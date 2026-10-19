/** Preserve the acceptance failure even if Docker or filesystem cleanup also
 * fails. Attempt every cleanup, in dependency order, before reporting success. */
export async function completeDisposableCheck(primary:{error:unknown}|undefined,steps:ReadonlyArray<{name:string;run:()=>Promise<unknown>}>){
 const cleanupErrors:Error[]=[];
 for(const step of steps)try{await step.run();}catch(error){cleanupErrors.push(new Error(`Disposable cleanup failed: ${step.name}`,{cause:error}));}
 if(primary&&cleanupErrors.length)throw new AggregateError([primary.error,...cleanupErrors],'Acceptance and disposable cleanup failed');
 if(primary)throw primary.error;
 if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Disposable cleanup failed');
}
