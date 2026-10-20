import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),mail:vi.fn(),timeline:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query}));
vi.mock('@/lib/mailbox/repository',()=>({getMailboxMessageForReview:m.mail}));
vi.mock('@/lib/mailbox/customer-timeline',()=>({readCustomerTimeline:m.timeline,listMailboxCustomers:m.list}));
import {revalidateLockedSkillPrivateReceipts as check} from './skill-private-receipt-check';
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const mail={id,bodyText:'PRIVATE',recipients:[],subject:'Synthetic'};
const receipt=(tool:string,input:unknown,data:unknown)=>({tool,input,output:{status:'success',data}});
beforeEach(()=>{vi.resetAllMocks();m.query.mockResolvedValue([{id}]);m.mail.mockResolvedValue(mail);});
it('uses the real private-source guard for consumed mail and returns no private payload',async()=>{
 const out=await check(owner,[receipt('mail_read',{messageId:id},mail)]);
 expect(out).toEqual({privateReceiptSourcesRevalidated:true,privateReceiptCount:1});
 expect(m.mail).toHaveBeenCalledExactlyOnceWith(owner,id);expect(JSON.stringify(out)).not.toContain('PRIVATE');
});
it.each(['purged','edited'])('rejects %s mail rather than trusting a saved receipt',async change=>{
 if(change==='purged')m.query.mockResolvedValue([]);else m.mail.mockResolvedValue({...mail,recipients:['changed']});
 await expect(check(owner,[receipt('mail_read',{messageId:id},mail)])).rejects.toThrow('Private replay source');
});
it('checks customer archive and scoped list contents through the real guard',async()=>{
 const timeline={customer:{id,archived:false},events:[]},list={items:[{id}],countries:[],hasMore:false};
 m.timeline.mockResolvedValue(timeline);m.list.mockResolvedValue(list);
 const receipts=[receipt('customer_timeline',{customerId:id},timeline),receipt('customer_timeline',{country:'DE',offset:20},list)];
 expect(await check(owner,receipts)).toMatchObject({privateReceiptCount:2});
 expect(m.list).toHaveBeenCalledWith(owner,{country:'DE',offset:20});
 m.timeline.mockResolvedValue({...timeline,customer:{id,archived:true}});
 await expect(check(owner,receipts)).rejects.toThrow('unavailable');
});
it('ignores unrelated tools and rejects invalid private receipts before reading',async()=>{
 expect(await check(owner,[receipt('knowledge_search',null,null)])).toMatchObject({privateReceiptCount:0});
 await expect(check(owner,[{tool:'mail_read',input:{messageId:id},output:{status:'failed'}}])).rejects.toThrow();
 expect(m.query).not.toHaveBeenCalled();expect(m.mail).not.toHaveBeenCalled();
});
