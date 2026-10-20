import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {captureSkillMemoryTimeFence,earliestSkillMemoryTimeFence} from './skill-memory-time-fence';
const owner='00000000-0000-4000-8000-000000000001',now=new Date('2026-10-20T00:00:00.000Z'),until=new Date('2026-10-20T00:00:01.000Z');
const client=()=>({query:vi.fn().mockResolvedValue({rows:[{checked_at:now,valid_before:until}]})});
it.each([
 [{},true,true],
 [{businessAt:now.toISOString()},false,true],
 [{knownAt:now.toISOString()},true,false],
 [{businessAt:now.toISOString(),knownAt:now.toISOString()},false,false],
])('uses only moving observation clocks for %j',async(input,business,known)=>{
 const db=client(),out=await captureSkillMemoryTimeFence(db as unknown as PoolClient,owner,[{tool:'memory_observation_search',input}]);
 expect(db.query.mock.calls[0][1]).toEqual([owner,business,known]);expect(out.memoryTimeValidBefore).toBe(until.toISOString());
 expect(JSON.stringify(out)).not.toContain(owner);
});
it('always fences current decision-memory activation/expiry even with no consumed memory receipts',async()=>{
 const db=client();await captureSkillMemoryTimeFence(db as unknown as PoolClient,owner,[]);
 expect(db.query.mock.calls[0][0]).toContain('m.valid_from boundary from agent_memory');
 expect(db.query.mock.calls[0][1]).toEqual([owner,false,false]);
});
it('does not invent a deadline when there are no future transitions',async()=>{
 const db=client();db.query.mockResolvedValue({rows:[{checked_at:now,valid_before:null}]});
 expect((await captureSkillMemoryTimeFence(db as unknown as PoolClient,owner,[])).memoryTimeValidBefore).toBeNull();
});
it.each([undefined,'invalid',now,new Date('invalid')])('rejects missing/malformed/already crossed boundary %j',async boundary=>{
 const db=client();db.query.mockResolvedValue({rows:[{checked_at:now,valid_before:boundary}]});
 await expect(captureSkillMemoryTimeFence(db as unknown as PoolClient,owner,[])).rejects.toThrow('time fence unavailable');
});
it('retains the earliest captured fence even if a later scan returns a later boundary',()=>{
 expect(earliestSkillMemoryTimeFence({memoryTimeValidBefore:null},{memoryTimeValidBefore:until.toISOString()},
  {memoryTimeValidBefore:'2026-10-20T01:00:00.000Z'})).toBe(until.toISOString());
 expect(earliestSkillMemoryTimeFence({memoryTimeValidBefore:null})).toBeUndefined();
});
