import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {withAgentRunLease,settleControlledAgentRun,type AgentRunLease} from './agent-run-lease';
import {withSkillRuntimeTaskLease} from './skill-runtime-task-lease';

const f=vi.hoisted(()=>({read:vi.fn(),boundary:vi.fn(),renew:vi.fn(),finish:vi.fn()}));
vi.mock('node:perf_hooks',()=>({performance:{now:()=>Date.now()}}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:f.read,withDatabaseDeadline:async(_d:unknown,work:()=>Promise<unknown>)=>work()}));
vi.mock('./repository',()=>({boundary:f.boundary,heartbeat:f.renew,finishRun:f.finish}));
const context={userId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',leaseToken:'33333333-3333-4333-8333-333333333333',role:'member' as const};
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(0);f.read.mockResolvedValue([{remaining_ms:90000,control:null}]);
 f.boundary.mockResolvedValue({control:null,result:null});f.renew.mockResolvedValue(true);f.finish.mockResolvedValue({status:'cancelled'});});
afterEach(()=>vi.useRealTimers());
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {resolve,promise};};

it('anchors initial remaining time before the database read',async()=>{
 const reading=deferred<Array<{remaining_ms:number;control:null}>>(),release=deferred<void>(),entered=deferred<void>();let lease!:AgentRunLease;
 f.read.mockReturnValue(reading.promise);
 const run=withAgentRunLease(context,async current=>{lease=current;entered.resolve();await release.promise;});
 await vi.advanceTimersByTimeAsync(2000);reading.resolve([{remaining_ms:5000,control:null}]);await entered.promise;
 expect(lease.remainingMs()).toBe(3000);await vi.advanceTimersByTimeAsync(3000);expect(lease.signal.aborted).toBe(true);
 release.resolve();await run;
});
it('prevents overlapping renewal and excludes response latency from the safe window',async()=>{
 const response=deferred<boolean>(),release=deferred<void>(),entered=deferred<void>();let lease!:AgentRunLease;
 f.renew.mockReturnValue(response.promise);
 const run=withAgentRunLease(context,async current=>{lease=current;entered.resolve();await release.promise;});await entered.promise;
 await vi.advanceTimersByTimeAsync(45000);expect(f.renew).toHaveBeenCalledTimes(1);response.resolve(true);await vi.advanceTimersByTimeAsync(0);
 expect(lease.remainingMs()).toBe(65000);release.resolve();await run;await vi.advanceTimersByTimeAsync(100000);expect(f.renew).toHaveBeenCalledTimes(1);
});
it('never revives an expired signal or recovery window with a late heartbeat',async()=>{
 const response=deferred<boolean>(),release=deferred<void>(),entered=deferred<void>();let lease!:AgentRunLease;
 f.read.mockResolvedValue([{remaining_ms:21000,control:null}]);f.renew.mockReturnValue(response.promise);
 const run=withAgentRunLease(context,async current=>{lease=current;entered.resolve();await release.promise;});await entered.promise;
 await vi.advanceTimersByTimeAsync(22000);expect(lease.signal.aborted).toBe(true);response.resolve(true);await vi.advanceTimersByTimeAsync(0);
 expect(lease.remainingMs()).toBe(0);release.resolve();await run;
});
it('stopping for transport recovery fences late renewal without discarding the known recovery window',async()=>{
 const response=deferred<boolean>(),release=deferred<void>(),entered=deferred<void>();let lease!:AgentRunLease;
 f.renew.mockReturnValue(response.promise);
 const run=withAgentRunLease(context,async current=>{lease=current;entered.resolve();await release.promise;});await entered.promise;
 await vi.advanceTimersByTimeAsync(20000);lease.stop();response.resolve(true);await vi.advanceTimersByTimeAsync(0);
 expect(lease.signal.aborted).toBe(true);expect(lease.remainingMs()).toBe(70000);release.resolve();await run;
});
it.each(['pause','cancel'] as const)('settles an initial %s without invoking model work and retains the saved reply',async control=>{
 f.read.mockResolvedValue([{remaining_ms:90000,control}]);f.boundary.mockResolvedValue({control,result:{reply:'Saved partial reply'}});
 const work=vi.fn();
 await expect(withSkillRuntimeTaskLease(context,work)).rejects.toThrow('lease lost or controlled');expect(work).not.toHaveBeenCalled();
 expect(f.finish).toHaveBeenCalledWith(context,'partial','Saved partial reply');expect(f.renew).not.toHaveBeenCalled();
});
it('settles a control that interrupted source validation before the heartbeat tick',async()=>{
 f.boundary.mockResolvedValue({control:'cancel',result:null});
 await expect(withSkillRuntimeTaskLease(context,async()=>{throw new Error('Source validation stopped');})).rejects.toThrow('Source validation stopped');
 expect(f.finish).toHaveBeenCalledWith(context,'partial','');expect(f.renew).not.toHaveBeenCalled();
});
it('does not write a control result after the local lease window expires',async()=>{
 const controller=new AbortController();expect(await settleControlledAgentRun(context,{signal:controller.signal,remainingMs:()=>0,stop:()=>{}})).toBe(false);
 expect(f.boundary).not.toHaveBeenCalled();expect(f.finish).not.toHaveBeenCalled();
});
it('keeps an uncontrolled task result untouched',async()=>{
 const controller=new AbortController();expect(await settleControlledAgentRun(context,{signal:controller.signal,remainingMs:()=>1000,stop:()=>{}})).toBe(false);
 expect(f.finish).not.toHaveBeenCalled();
});
