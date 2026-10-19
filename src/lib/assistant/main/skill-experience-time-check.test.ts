import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {revalidateLockedSkillExperienceTimes} from './skill-experience-time-check';
const owner='11111111-1111-4111-8111-111111111111',skill='22222222-2222-4222-8222-222222222222',run='33333333-3333-4333-8333-333333333333';
const artifact={plan:{pin:{ownerId:owner,skillId:skill,version:1},expiresAt:'2026-10-19T02:00:00.000Z',cases:[{id:'case',provenance:'historical-task'}]},
 rawReceipts:{baselineSources:{case:{runId:run}},candidateSources:{case:{runId:run}}}};
const valid={valid:true,checked_at:new Date('2026-10-19T01:00:00.000Z'),valid_before:new Date('2026-10-19T01:30:00.000Z'),observation_count:2};
it('checks the stored target and task pins with a common database clock and returns only time/count metadata',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[valid]});
 const result=await revalidateLockedSkillExperienceTimes({query} as unknown as PoolClient,owner,artifact);
 expect(query.mock.calls[0][1]).toEqual([owner,[run],skill,1,artifact.plan.expiresAt]);
 expect(result).toEqual({methodExperienceTimesRevalidated:true,methodExperienceTimeCheckedAt:valid.checked_at.toISOString(),
  methodExperienceValidBefore:valid.valid_before.toISOString(),methodExperienceTimeObservationCount:2});
 expect(JSON.stringify(result)).not.toContain(owner);
});
it('allows imported methods with zero local observations after the database confirms the target and plan',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{...valid,observation_count:0}]});
 expect((await revalidateLockedSkillExperienceTimes({query} as unknown as PoolClient,owner,artifact)).methodExperienceTimeObservationCount).toBe(0);
});
it.each([{valid:false},{checked_at:'invalid'},{valid_before:valid.checked_at},{observation_count:-1}])('rejects invalid final time metadata %j',async change=>{
 const query=vi.fn().mockResolvedValue({rows:[{...valid,...change}]});
 await expect(revalidateLockedSkillExperienceTimes({query} as unknown as PoolClient,owner,artifact)).rejects.toThrow('time changed after preparation');
});
it('rejects a different owner before querying source metadata',async()=>{
 const query=vi.fn();await expect(revalidateLockedSkillExperienceTimes({query} as unknown as PoolClient,skill,artifact)).rejects.toThrow('owner changed');
 expect(query).not.toHaveBeenCalled();
});
