import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {lockSkillAcceptancePinnedMethods} from './skill-pinned-method-locks';

const m=vi.hoisted(()=>({experience:vi.fn()}));
vi.mock('./skill-source-guard',()=>({lockCurrentSkillExperienceSources:m.experience}));
const userId='00000000-0000-4000-8000-000000000001',runId='00000000-0000-4000-8000-000000000002';
const artifact={plan:{cases:[{id:'case',provenance:'historical-task'}]},rawReceipts:{baselineSources:{case:{runId}},candidateSources:{case:{runId}}}};
const files={'SKILL.md':'Synthetic pinned method'};
const pin={run_id:runId,skill_id:userId,version:1,enabled:true,published:false,owner_id:userId,scope:'account',
 source:'synthetic',validation:{},files,content_hash:digest(files)};
const client=(pins:unknown[],count=pins.length)=>({query:vi.fn().mockResolvedValueOnce({rows:[{n:count}]}).mockResolvedValueOnce({rows:pins})});
beforeEach(()=>{vi.resetAllMocks();m.experience.mockResolvedValue({observationCount:0});});

it('locks shared versions once while retaining every run pin',async()=>{
 m.experience.mockResolvedValue({observationCount:2});const db=client([pin,{...pin,run_id:userId}]);
 const out=await lockSkillAcceptancePinnedMethods(db as unknown as PoolClient,userId,artifact);
 expect(out).toEqual({pinnedMethodSourcesLocked:true,pinnedMethodPinCount:2,pinnedMethodVersionCount:1,pinnedMethodExperienceObservationCount:2});
 expect(db.query.mock.calls[0][1]).toEqual([[runId]]);
 expect(m.experience).toHaveBeenCalledExactlyOnceWith(db,userId,expect.objectContaining({skill_id:pin.skill_id,version:1,files}));
 expect(JSON.stringify(out)).not.toContain('Synthetic');
});
it('accepts published global imported methods and tasks with no pins',async()=>{
 await expect(lockSkillAcceptancePinnedMethods(client([{...pin,owner_id:runId,scope:'global',published:true}]) as unknown as PoolClient,userId,artifact)).resolves.toMatchObject({pinnedMethodPinCount:1});
 await expect(lockSkillAcceptancePinnedMethods(client([]) as unknown as PoolClient,userId,artifact)).resolves.toMatchObject({pinnedMethodPinCount:0});
});
it.each([{enabled:false},{owner_id:runId},{owner_id:runId,scope:'global',published:false},{files:{'SKILL.md':'changed'}}])('rejects revoked or changed method %j',async change=>{
 await expect(lockSkillAcceptancePinnedMethods(client([{...pin,...change}]) as unknown as PoolClient,userId,artifact)).rejects.toThrow('source changed');
 expect(m.experience).not.toHaveBeenCalled();
});
it('rejects missing visible versions and invalid lock counts',async()=>{
 await expect(lockSkillAcceptancePinnedMethods(client([],1) as unknown as PoolClient,userId,artifact)).rejects.toThrow('source unavailable');
 await expect(lockSkillAcceptancePinnedMethods(client([],-1) as unknown as PoolClient,userId,artifact)).rejects.toThrow('lock incomplete');
});
it('propagates revoked experience provenance and missing migration without reporting success',async()=>{
 m.experience.mockRejectedValue(new Error('Experience original changed'));
 await expect(lockSkillAcceptancePinnedMethods(client([pin]) as unknown as PoolClient,userId,artifact)).rejects.toThrow('Experience original changed');
 const query=vi.fn().mockRejectedValue(new Error('function does not exist'));
 await expect(lockSkillAcceptancePinnedMethods({query} as unknown as PoolClient,userId,artifact)).rejects.toThrow('function does not exist');expect(query).toHaveBeenCalledTimes(1);
});
