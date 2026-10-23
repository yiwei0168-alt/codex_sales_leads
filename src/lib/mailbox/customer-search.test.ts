import {expect,it,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn()}));vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query}));
import {searchMailboxCustomers} from './customer-search';
beforeEach(()=>{vi.clearAllMocks();m.query.mockResolvedValue([]);});
it('binds owner and country and excludes archived/merged customers',async()=>{
 await searchMailboxCustomers('owner','Reichelt','DE');
 expect(m.query).toHaveBeenCalledWith('owner',expect.stringContaining('user_id=$1 and not archived and merged_into is null'),['owner',['%reichelt%'],'DE','reichelt']);
});
it('returns candidate ambiguity and pagination without merging or altering records',async()=>{
 m.query.mockResolvedValue(Array.from({length:21},(_,i)=>({id:String(i),name:'Example',domain:'example.invalid'})));
 const result=await searchMailboxCustomers('owner','Example');expect(result.items).toHaveLength(20);expect(result.hasMore).toBe(true);
 expect(m.query).toHaveBeenCalledTimes(1);expect(m.query.mock.calls[0][1]).toMatch(/^select/);
});
it('does not turn whitespace into an unrestricted company scan',async()=>{
 expect(await searchMailboxCustomers('owner',' ')).toEqual({items:[],hasMore:false});expect(m.query).not.toHaveBeenCalled();
});
