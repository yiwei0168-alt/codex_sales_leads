import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),current:vi.fn(),lock:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:vi.fn(),tenantTransaction:async(_user:string,work:(client:unknown)=>Promise<unknown>)=>work({query:m.query})}));
vi.mock('./skill-source-guard',()=>({skillSourcesCurrent:m.current,lockCurrentSkillExperienceSources:m.lock}));
import {changeSkill} from './skills';
const context={userId:'00000000-0000-4000-8000-000000000001',role:'member' as const};
const selected={source:'local-experience:stored',scope:'account',owner_id:context.userId,files:{'SKILL.md':'Read originals'},content_hash:'stored',
 validation:{scripts:'none',dependencies:'none'},dependencies:[]};
const action={id:'00000000-0000-4000-8000-000000000002',version:1,operation:'enable' as const};
beforeEach(()=>{vi.resetAllMocks();m.current.mockResolvedValue(true);m.lock.mockResolvedValue({localExperienceSourceLocksHeld:true,observationCount:2});
 m.query.mockImplementation(async(sql:string)=>sql.includes('to_regprocedure')?{rows:[{configured:false}]}:
  sql.startsWith('select v.validation')?{rows:[selected],rowCount:1}:{rows:[],rowCount:1});});
it.each(['enable','rollback'] as const)('holds original source locks before manual %s mutation',async operation=>{
 await expect(changeSkill(context,{...action,operation},true)).resolves.toEqual({updated:true});
 expect(m.lock).toHaveBeenCalledWith(expect.objectContaining({query:m.query}) as PoolClient,context.userId,selected);
 const mutation=m.query.mock.calls.findIndex(([sql])=>sql.startsWith('update agent_skill'));
 expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[mutation]);
});
it('rejects source changes during lock acquisition without writing a Skill',async()=>{
 m.lock.mockRejectedValue(new Error('Skill experience sources changed after locking'));
 await expect(changeSkill(context,action,true)).rejects.toThrow('after locking');
 expect(m.query.mock.calls.some(([sql])=>sql.startsWith('update agent_skill'))).toBe(false);
});
it('allows disabling after source loss without acquiring source locks',async()=>{
 m.lock.mockRejectedValue(new Error('Source removed'));m.current.mockResolvedValue(false);
 await expect(changeSkill(context,{...action,operation:'disable'},true)).resolves.toEqual({updated:true});
 expect(m.lock).not.toHaveBeenCalled();expect(m.current).not.toHaveBeenCalled();
});
