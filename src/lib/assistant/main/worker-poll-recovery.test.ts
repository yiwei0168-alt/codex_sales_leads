import {expect,it,vi} from 'vitest';
import {recoverWorkerPoll} from './worker-poll-recovery';
const failure=(code:string)=>Object.assign(new Error('synthetic private detail'),{code});
it.each(['Connection terminated due to connection timeout','timeout exceeded when trying to connect','timeout expired','Connection terminated unexpectedly'])('recovers known uncoded pg connection failure: %s',async message=>{
 const poll=vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValue(null),wait=vi.fn().mockResolvedValue(undefined);
 expect(await recoverWorkerPoll(poll,{once:false,signal:new AbortController().signal,onFailure:()=>{},wait})).toEqual({stopped:false,value:null});expect(poll).toHaveBeenCalledTimes(2);
});
it('recovers transient failures then returns the original claimed task once',async()=>{
 const task={id:'original-task',lease:'original-lease'},poll=vi.fn().mockRejectedValueOnce(failure('DATABASE_DEADLINE_EXCEEDED')).mockRejectedValueOnce(failure('ECONNRESET')).mockResolvedValue(task);
 const wait=vi.fn().mockResolvedValue(undefined),log=vi.fn();
 expect(await recoverWorkerPoll(poll,{once:false,signal:new AbortController().signal,onFailure:log,wait})).toEqual({stopped:false,value:task});
 expect(poll).toHaveBeenCalledTimes(3);expect(wait.mock.calls.map(call=>call[0])).toEqual([2000,4000]);
 expect(JSON.stringify(log.mock.calls)).not.toContain('private detail');
});
it('keeps single-pass diagnostics and permanent TLS/config errors visible',async()=>{
 for(const [once,code] of [[true,'DATABASE_DEADLINE_EXCEEDED'],[false,'CERT_HAS_EXPIRED'],[false,'INVALID_CONFIGURATION']] as const){
  const poll=vi.fn().mockRejectedValue(failure(code)),wait=vi.fn(),log=vi.fn();
  await expect(recoverWorkerPoll(poll,{once,signal:new AbortController().signal,onFailure:log,wait})).rejects.toMatchObject({code});
  expect(poll).toHaveBeenCalledTimes(1);expect(wait).not.toHaveBeenCalled();expect(log).not.toHaveBeenCalled();
 }
});
it('caps backoff and stops without claiming a task after shutdown during a wait',async()=>{
 const controller=new AbortController(),poll=vi.fn().mockRejectedValue(failure('ECONNREFUSED')),waits:number[]=[];
 const result=await recoverWorkerPoll(poll,{once:false,signal:controller.signal,onFailure:()=>{},wait:async ms=>{waits.push(ms);if(waits.length===6){controller.abort();throw new Error('Abort');}}});
 expect(result).toEqual({stopped:true});expect(waits).toEqual([2000,4000,8000,16000,30000,30000]);expect(poll).toHaveBeenCalledTimes(6);
});
it('does not poll when shutdown has already been requested',async()=>{
 const controller=new AbortController();controller.abort();const poll=vi.fn();
 expect(await recoverWorkerPoll(poll,{once:false,signal:controller.signal,onFailure:()=>{}})).toEqual({stopped:true});expect(poll).not.toHaveBeenCalled();
});
