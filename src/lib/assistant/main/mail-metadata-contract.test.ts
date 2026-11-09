import {expect,it} from 'vitest';
import {describeTool,productTools} from './tools';
import {result} from './contracts';
const tool=productTools.find(t=>t.id==='mailbox_message_list')!;
it('publishes the real mail metadata return shape and rejects guessed field names',()=>{
 const schema=JSON.stringify(describeTool(tool).outputSchema);
 for(const field of ['items','sentAt','sourceUrl','nextOffset','hasMore','paginationLimitReached'])expect(schema).toContain(`"${field}"`);
 const page={items:[{id:'11111111-1111-4111-8111-111111111111',sentAt:'2026-11-02 09:00:00+00',direction:'inbound',sourceUrl:'/api/mailbox/messages/11111111-1111-4111-8111-111111111111'}],
  interval:{from:'2026-11-02T00:00:00Z',until:'2026-11-03T00:00:00Z',fromInclusive:true,untilExclusive:true},offset:0,hasMore:false,nextOffset:null,paginationLimitReached:false,scope:'owned imported metadata'};
 expect(tool.output.parse(result(page)).data).toEqual(page);
 expect(tool.output.safeParse(result({...page,items:undefined,messages:page.items})).success).toBe(false);
 expect(tool.output.safeParse(result({...page,items:[{...page.items[0],sentAt:undefined,date:page.items[0].sentAt}]})).success).toBe(false);
 expect(tool.output.parse(result(null,{status:'unavailable'})).status).toBe('unavailable');
});
