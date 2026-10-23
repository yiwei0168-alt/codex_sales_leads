import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({sales:vi.fn(),mail:vi.fn()}));
vi.mock('../product-actions',()=>({findProductActionCompanies:m.sales}));
vi.mock('@/lib/mailbox/customer-search',()=>({searchMailboxCustomers:m.mail}));
import {searchOwnedCompanies} from './company-search';
beforeEach(()=>{vi.clearAllMocks();m.sales.mockResolvedValue({companies:[],hasMore:false});m.mail.mockResolvedValue({items:[],hasMore:false});});
it('finds mailbox-only companies even when the sales library is empty',async()=>{
 m.mail.mockResolvedValue({items:[{id:'mailbox-id',name:'reichelt.de',domain:'reichelt.de'}],hasMore:false});
 const result=await searchOwnedCompanies('owner',{query:'Reichelt'});
 expect(result.companies).toEqual([]);expect(result.mailboxCustomers.items[0].id).toBe('mailbox-id');
 expect(m.mail).toHaveBeenCalledWith('owner','Reichelt',undefined);
});
it('requires selection for multiple candidates, including mail subdomains',async()=>{
 m.mail.mockResolvedValue({items:[{id:'a',domain:'reichelt.de'},{id:'b',domain:'smtp02.reichelt.de'}],hasMore:false});
 expect((await searchOwnedCompanies('owner',{query:'Reichelt',countryCode:'DE'})).matching.requiresSelection).toBe(true);
 expect(m.sales).toHaveBeenCalledWith('owner',{kind:'library',companyQuery:'Reichelt',countryCode:'DE'});
});
