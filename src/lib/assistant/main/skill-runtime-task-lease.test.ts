import {afterEach,expect,it,vi} from 'vitest';
import {withSkillRuntimeTaskLease} from './skill-runtime-task-lease';
const f=vi.hoisted(()=>({remaining:90000,control:null as string|null,renew:vi.fn(async()=>true)}));
vi.mock('node:perf_hooks',()=>({performance:{now:()=>Date.now()}}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:async()=>f.remaining>0?[{remaining_ms:f.remaining}]:[],withDatabaseDeadline:async(_deadline:unknown,work:()=>Promise<unknown>)=>work()}));
vi.mock('./repository',()=>({boundary:async()=>({control:f.control}),heartbeat:(...args:unknown[])=>f.renew(...args as [])}));
const context={userId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',leaseToken:'33333333-3333-4333-8333-333333333333',role:'member' as const};
afterEach(()=>{vi.useRealTimers();f.remaining=90000;f.control=null;f.renew.mockReset();f.renew.mockResolvedValue(true);});
it('renews the ordinary task at 20 seconds and clears renewal on completion',async()=>{
 vi.useFakeTimers();let release!:()=>void,enter!:()=>void;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
 const run=withSkillRuntimeTaskLease(context,async signal=>{enter();await released;expect(signal.aborted).toBe(false);return 7;});
 await entered;await vi.advanceTimersByTimeAsync(20000);expect(f.renew).toHaveBeenCalledTimes(1);release();expect(await run).toBe(7);
 await vi.advanceTimersByTimeAsync(100000);expect(f.renew).toHaveBeenCalledTimes(1);
});
it.each(['deadline','cancel','failed-renewal'])('aborts idle model work after %s',async kind=>{
 vi.useFakeTimers();if(kind==='deadline')f.remaining=1000;
 let release!:()=>void,enter!:()=>void,signal!:AbortSignal;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
 const run=withSkillRuntimeTaskLease(context,async current=>{signal=current;enter();await released;});
 await entered;if(kind==='cancel')f.control='cancel';if(kind==='failed-renewal')f.renew.mockResolvedValue(false);
 await vi.advanceTimersByTimeAsync(kind==='deadline'?1000:20000);expect(signal.aborted).toBe(true);release();await run;
});
it('refuses an expired stored lease before invoking work',async()=>{
 f.remaining=0;const work=vi.fn();await expect(withSkillRuntimeTaskLease(context,work)).rejects.toThrow('lease unavailable');expect(work).not.toHaveBeenCalled();
});
