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
it('retains separate IDs while recognizing one confirmed mailbox timeline across matching stores',async()=>{
 m.sales.mockResolvedValue({companies:[{id:'sales',domain:'REICHELT.DE',countryCode:'DE'}],hasMore:false});
 m.mail.mockResolvedValue({items:[{id:'mail',domain:'reichelt.de',country:'DE',confirmed:true}],hasMore:false});
 const result=await searchOwnedCompanies('owner',{query:'Reichelt'});
 expect(result.matching).toMatchObject({requiresSelection:true,mailboxTimelineUnambiguous:true});
 expect(result.companies[0].id).toBe('sales');expect(result.mailboxCustomers.items[0].id).toBe('mail');
});
it.each([{domain:'smtp02.reichelt.de'},{country:'GB'},{country:null},{confirmed:false},{domain:''}])('does not relax timeline ambiguity for %j',async change=>{
 m.sales.mockResolvedValue({companies:[{id:'sales',domain:'reichelt.de',countryCode:'DE'}],hasMore:false});
 m.mail.mockResolvedValue({items:[{id:'mail',domain:'reichelt.de',country:'DE',confirmed:true,...change}],hasMore:false});
 expect((await searchOwnedCompanies('owner',{query:'Reichelt'})).matching.mailboxTimelineUnambiguous).toBe(false);
});
it.each(['sales-page','mail-page','multiple-mail','multiple-sales'])('keeps %s ambiguous',async kind=>{
 const sales={id:'sales',domain:'reichelt.de',countryCode:'DE'},mail={id:'mail',domain:'reichelt.de',country:'DE',confirmed:true};
 m.sales.mockResolvedValue({companies:kind==='multiple-sales'?[sales,{...sales,id:'s2'}]:[sales],hasMore:kind==='sales-page'});
 m.mail.mockResolvedValue({items:kind==='multiple-mail'?[mail,{...mail,id:'m2'}]:[mail],hasMore:kind==='mail-page'});
 expect((await searchOwnedCompanies('owner',{query:'Reichelt'})).matching.mailboxTimelineUnambiguous).toBe(false);
});
