import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {assertCurrentKnowledgePublisher} from './publication-authorization';
it.each([['private','member'],['private','admin'],['shared','admin']])('allows current %s publisher role %s',async(visibility,role)=>{
 const query=vi.fn().mockResolvedValue({rows:[{role}]});
 await expect(assertCurrentKnowledgePublisher({query} as unknown as PoolClient,'owner',visibility)).resolves.toBeUndefined();
 expect(query.mock.calls[0][1]).toEqual(['owner']);
});
it.each([{rows:[]},{rows:[{role:'member'}]},{rows:[{role:'unknown'}]}])('rejects missing or downgraded shared publisher %j',async({rows})=>{
 const query=vi.fn().mockResolvedValue({rows});
 await expect(assertCurrentKnowledgePublisher({query} as unknown as PoolClient,'owner','shared')).rejects.toThrow('no longer authorized');
});
it('rejects unknown visibility before querying',async()=>{
 const query=vi.fn();await expect(assertCurrentKnowledgePublisher({query} as unknown as PoolClient,'owner','public')).rejects.toThrow('visibility unavailable');expect(query).not.toHaveBeenCalled();
});
