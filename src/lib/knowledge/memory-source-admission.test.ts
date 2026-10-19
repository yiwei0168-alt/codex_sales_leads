import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {lockMemorySourceAdmission} from './memory-source-admission';
it.each([false,true])('takes global admission before owner admission (global=%s)',async global=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 await lockMemorySourceAdmission({query} as unknown as PoolClient,'owner',global);
 expect(query.mock.calls[0][0]).toContain("app_current_user_role()='admin'");
 expect(query.mock.calls[0][1]).toEqual([global]);
 expect(query.mock.calls[1]).toEqual(['select pg_advisory_xact_lock(hashtextextended($1,0))',['skill-memory-owner:owner']]);
});
it('does not take owner locks after admission failure',async()=>{
 const query=vi.fn().mockRejectedValue(new Error('unavailable'));
 await expect(lockMemorySourceAdmission({query} as unknown as PoolClient,'owner')).rejects.toThrow('unavailable');
 expect(query).toHaveBeenCalledOnce();
});
