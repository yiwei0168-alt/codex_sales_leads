import {afterEach,expect,it,vi} from 'vitest';
import type {SkillCollectorTransaction} from './skill-model-journal';
import {withSkillCandidateLease} from './skill-candidate-lease';
vi.mock('./skill-model-journal',()=>({assertSkillCollector:async()=>{}}));
vi.mock('node:perf_hooks',()=>({performance:{now:()=>Date.now()}}));
const pin={ownerId:'11111111-1111-4111-8111-111111111111',evaluationId:'22222222-2222-4222-8222-222222222222',arm:'candidate' as const,sourceKind:'synthetic-fixture' as const};
afterEach(()=>vi.useRealTimers());
function fixture(){
 const state={claim:true,alive:true,remaining:90_000,renewals:0,releases:0,lockError:false};
 const transaction:SkillCollectorTransaction=async(_owner,work)=>work({query:async(sql:string)=>{
  if(sql.includes('to_regclass'))return {rows:[{available:true}]};
  if(sql.startsWith('set local'))return {rows:[]};
  if(sql.startsWith('insert into'))return {rows:state.claim?[{execution_token:'12',remaining_ms:state.remaining}]:[]};
  if(sql.includes('for update nowait')){if(state.lockError)throw new Error('Synthetic row lock conflict');return {rowCount:1,rows:[{execution_token:'12'}]};}
  if(sql.includes('set lease_until=')){state.renewals++;return {rows:state.alive?[{remaining_ms:state.remaining}]:[]};}
  if(sql.startsWith('select exists'))return {rows:[{alive:state.alive}]};
  if(sql.includes("set status='released'")){state.releases++;return {rows:[]};}
  throw new Error('Unexpected lease fixture SQL');
 }} as never);
 return {state,transaction};
}
it('renews at 20 seconds and ends the timer and scope on completion',async()=>{
 vi.useFakeTimers();const f=fixture();let release!:()=>void,enter!:()=>void,check!:()=>Promise<void>;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
 const run=withSkillCandidateLease(f.transaction,pin,async(assertOwned,token)=>{check=assertOwned;expect(token).toBe('12');enter();await released;return 7;});
 await entered;await vi.advanceTimersByTimeAsync(20_000);expect(f.state.renewals).toBe(1);await check();
 release();expect(await run).toBe(7);await expect(check()).rejects.toThrow('scope ended');
 await vi.advanceTimersByTimeAsync(100_000);expect(f.state.renewals).toBe(1);expect(f.state.releases).toBe(1);
});
it.each(['deadline','controlled','heartbeat-conflict'])('aborts and rejects stale work after %s',async kind=>{
 vi.useFakeTimers();const f=fixture();if(kind==='deadline')f.state.remaining=1000;
 let release!:()=>void,enter!:()=>void,check!:()=>Promise<void>,signal!:AbortSignal;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
 const run=withSkillCandidateLease(f.transaction,pin,async(assertOwned,_token,currentSignal)=>{check=assertOwned;signal=currentSignal;enter();await released;});
 const rejected=expect(run).rejects.toThrow('lease lost or controlled');await entered;
 if(kind==='deadline')await vi.advanceTimersByTimeAsync(1001);
 else if(kind==='controlled'){f.state.alive=false;await expect(check()).rejects.toThrow('lease lost or controlled');}
 else{f.state.lockError=true;await vi.advanceTimersByTimeAsync(20_000);}
 expect(signal.aborted).toBe(true);await expect(check()).rejects.toThrow('lease lost or controlled');release();await rejected;
});
it('refuses another owner or a controlled arm before work',async()=>{
 const f=fixture();f.state.claim=false;const work=vi.fn();
 await expect(withSkillCandidateLease(f.transaction,pin,work)).rejects.toThrow('already owned or controlled');expect(work).not.toHaveBeenCalled();
});
