import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {assertCurrentUploadLease} from './publication-lease';
it('does not require a worker lease for an interactive caller',async()=>{
 const query=vi.fn();await assertCurrentUploadLease({query} as unknown as PoolClient,'owner','job');expect(query).not.toHaveBeenCalled();
});
it('checks the owner, task and token at the database wall clock without renewing',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{id:'job'}]});
 await assertCurrentUploadLease({query} as unknown as PoolClient,'owner','job','token');
 expect(query.mock.calls[0][1]).toEqual(['job','owner','token']);
 expect(query.mock.calls[0][0]).toContain('lease_until>clock_timestamp()');expect(query).toHaveBeenCalledOnce();
});
it('rejects an expired or changed lease',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 await expect(assertCurrentUploadLease({query} as unknown as PoolClient,'owner','job','token')).rejects.toThrow('expired after publication preparation');
});
