import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mock.query}));
import {listOwnedSalesCompanies} from './company-list';
beforeEach(()=>vi.clearAllMocks());
const rows=Array.from({length:21},(_,i)=>({id:`c${i}`,name:`Company ${i}`,domain:`company-${i}.invalid`,countryCode:'GB',roles:['Distributor']}));
it('keeps the sentinel out of results and exposes the next offset with an exact country/owner scope',async()=>{
 mock.query.mockResolvedValue(rows);const out=await listOwnedSalesCompanies('owner',{countryCode:'GB',offset:20});
 expect(out.items).toHaveLength(20);expect(out).toMatchObject({hasMore:true,nextOffset:40,offset:20,paginationLimitReached:false});
 expect(mock.query).toHaveBeenCalledWith('owner',expect.stringContaining('w.owner_id=$1'),['owner','GB',20]);
});
it('ends empty and exact-size final pages without inventing another page',async()=>{
 mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce(rows.slice(0,20));
 expect(await listOwnedSalesCompanies('owner',{})).toMatchObject({items:[],hasMore:false,nextOffset:null});
 expect(await listOwnedSalesCompanies('owner',{})).toMatchObject({hasMore:false,nextOffset:null});
});
it('does not claim exhaustion when the maximum offset prevents continuing',async()=>{
 mock.query.mockResolvedValue(rows);expect(await listOwnedSalesCompanies('owner',{offset:100000})).toMatchObject({hasMore:true,nextOffset:null,paginationLimitReached:true});
});
it.each([{offset:-1},{offset:100001},{countryCode:'GB OR true'},{userId:'other'}])('rejects invalid or client-supplied scope %j before reading',async input=>{
 await expect(listOwnedSalesCompanies('owner',input)).rejects.toThrow();expect(mock.query).not.toHaveBeenCalled();
});
it('keeps unknown/malformed saved roles empty rather than inventing a classification',async()=>{
 mock.query.mockResolvedValue([{...rows[0],roles:null},{...rows[1],roles:['SI',42]}]);
 expect((await listOwnedSalesCompanies('owner',{})).items.map(r=>r.roles)).toEqual([[],['SI']]);
});
