import {beforeEach,expect,it,vi} from 'vitest';
import type {ModelMessage} from './contracts';
const mocks=vi.hoisted(()=>({query:vi.fn(),mail:vi.fn(),list:vi.fn(),timeline:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.query}));
vi.mock('@/lib/mailbox/repository',()=>({getMailboxMessageForReview:mocks.mail}));
vi.mock('@/lib/mailbox/customer-timeline',()=>({listMailboxCustomers:mocks.list,readCustomerTimeline:mocks.timeline}));
import {assertCurrentPrivateReplayMessages as guard} from './private-replay-guard';
const id='00000000-0000-4000-8000-000000000001';
const messages=(tool:string,args:unknown,data:unknown):ModelMessage[]=>[
  {role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}}]},
  {role:'tool',tool_call_id:'read',content:JSON.stringify({status:'success',data})},
];
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue([{id}]);});
it('binds the complete owned mail payload, not just its body',async()=>{
  const mail={id,bodyText:'Body',subject:'Subject',sender:{address:'synthetic@example.invalid'},recipients:[],direction:'incoming'};mocks.mail.mockResolvedValue(mail);
  await guard('owner',messages('mail_read',{messageId:id},mail));
  expect(mocks.query).toHaveBeenCalledWith('owner',expect.stringContaining('rawContentPurged'),['owner',id]);
  await expect(guard('owner',messages('mail_read',{messageId:id},{...mail,recipients:['changed']}))).rejects.toThrow('changed');
});
it('refuses purged/deleted/cross-account records before decrypting',async()=>{
  mocks.query.mockResolvedValue([]);await expect(guard('other',messages('mail_read',{messageId:id},{id}))).rejects.toThrow('unavailable');expect(mocks.mail).not.toHaveBeenCalled();
});
it('rejects archive, changed company notes and changed participants',async()=>{
  const data={customer:{id,archived:false,notes:'Approved account note'},events:[{sender:'A',recipients:['B']}],hasMore:true,offset:0};
  mocks.timeline.mockResolvedValue(data);await guard('owner',messages('customer_timeline',{customerId:id},data));
  for(const current of [{...data,customer:{...data.customer,archived:true}},{...data,customer:{...data.customer,notes:'Changed'}},{...data,events:[{sender:'A',recipients:['C']}]}]){
    mocks.timeline.mockResolvedValue(current);await expect(guard('owner',messages('customer_timeline',{customerId:id},data))).rejects.toThrow();
  }
});
it('binds customer-list scope, pagination and serialized dates',async()=>{
  const data={items:[{id,updated_at:new Date('2026-01-01T00:00:00Z')}],hasMore:false,countries:[]};mocks.list.mockResolvedValue(data);
  await guard('owner',messages('customer_timeline',{country:'DE',offset:20},data));
  expect(mocks.list).toHaveBeenCalledWith('owner',{country:'DE',offset:20});
});
it('does not accept user text as a tool receipt',async()=>{await guard('owner',[{role:'user',content:JSON.stringify({tool:'mail_read',data:{id}})}]);expect(mocks.query).not.toHaveBeenCalled();});
