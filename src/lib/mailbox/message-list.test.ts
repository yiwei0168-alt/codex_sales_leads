import {beforeEach,expect,it,vi} from 'vitest';
const query=vi.hoisted(()=>vi.fn());vi.mock('@/lib/rag/db',()=>({tenantQuery:query}));
import {listImportedMailMetadata,mailboxMessageListInput} from './message-list';
const input={from:'2026-11-02T00:00:00+08:00',until:'2026-11-06T00:00:00+08:00',offset:0};
beforeEach(()=>{query.mockReset();});
it('pages current-account metadata without bodies or customer linkage filters',async()=>{
 query.mockResolvedValue(Array.from({length:21},(_,n)=>({id:`id-${n}`,sentAt:'2026-11-02 00:00:00+08',direction:'inbound'})));
 const page=await listImportedMailMetadata('owner',input);
 expect(query).toHaveBeenCalledWith('owner',expect.stringContaining('where user_id=$1'),['owner',input.from,input.until,0]);
 const sql=query.mock.calls[0][1];expect(sql).toContain('sent_at >= $2');expect(sql).toContain('sent_at < $3');expect(sql).toContain('order by sent_at,id');
 expect(sql).not.toMatch(/join|body_text|ciphertext|credential/i);
 expect(page.items).toHaveLength(20);expect(page).toMatchObject({hasMore:true,nextOffset:20,paginationLimitReached:false});
 expect(page.items[0].sourceUrl).toBe('/api/mailbox/messages/id-0');
});
it('does not call a full last page truncated or silently claim completion at the offset cap',async()=>{
 query.mockResolvedValue(Array.from({length:20},(_,n)=>({id:`id-${n}`})));
 expect(await listImportedMailMetadata('owner',input)).toMatchObject({hasMore:false,nextOffset:null});
 query.mockResolvedValue(Array.from({length:21},(_,n)=>({id:`id-${n}`})));
 expect(await listImportedMailMetadata('owner',{...input,offset:100000})).toMatchObject({hasMore:true,nextOffset:null,paginationLimitReached:true});
});
it('requires explicit timezone/date bounds and cannot accept a caller-supplied account',()=>{
 for(const bad of [{...input,from:'2026-11-02T00:00:00'},{...input,until:input.from},{...input,until:'2028-11-02T00:00:00+08:00'},{...input,userId:'other'},{...input,offset:-1}])expect(mailboxMessageListInput.safeParse(bad).success).toBe(false);
 expect(mailboxMessageListInput.parse({from:input.from,until:input.until}).offset).toBe(0);
});
