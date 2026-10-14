import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),tenant:vi.fn(),transaction:vi.fn(),client:vi.fn(),learn:vi.fn(),sync:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({query:mocks.query,tenantQuery:mocks.tenant,tenantTransaction:mocks.transaction}));
vi.mock('./service',()=>({reviewMailboxMessageForLearning:mocks.learn,syncAliMail:mocks.sync}));
import {enqueueLearning,processMailboxWork} from './work-queue';
beforeEach(()=>{vi.resetAllMocks();mocks.transaction.mockImplementation((_user,fn)=>fn({query:mocks.client}));});
it('accepts eight messages and persists individual consent snapshots',async()=>{
 const ids=Array.from({length:8},(_,i)=>String(i));
 mocks.client.mockResolvedValueOnce({rowCount:8,rows:ids.map(id=>({id,content_sha256:'hash'}))});
 mocks.client.mockResolvedValue({rows:[{id:'job'}]});
 expect((await enqueueLearning('owner',ids)).queued).toBe(8);
 expect(mocks.client).toHaveBeenCalledTimes(9);
 expect(JSON.parse(mocks.client.mock.calls[1][1][2])).toEqual({consent:true,contentSha256:'hash'});
});
it('rejects mixed ownership or unavailable rows atomically before enqueue',async()=>{
 mocks.client.mockResolvedValue({rowCount:1,rows:[{id:'a'}]});
 await expect(enqueueLearning('owner',['a','other'])).rejects.toThrow();
 expect(mocks.client).toHaveBeenCalledOnce();
});
it('does not send when the authorized source has changed',async()=>{
 mocks.query.mockResolvedValue([{id:'job',user_id:'owner',lease_token:'token'}]);
 mocks.tenant.mockResolvedValueOnce([{kind:'learn',target_id:'mail',payload:{consent:true,contentSha256:'old'}}]);
 mocks.tenant.mockResolvedValueOnce([{content_sha256:'new'}]);
 mocks.tenant.mockResolvedValue([]);
 await processMailboxWork();
 expect(mocks.learn).not.toHaveBeenCalled();
});
it('holds an interrupted provider call without replay',async()=>{
 mocks.query.mockResolvedValue([{id:'job',user_id:'owner',lease_token:'token'}]);
 mocks.tenant.mockResolvedValueOnce([{kind:'learn',target_id:'mail',payload:{consent:true,contentSha256:'hash'}}]);
 mocks.tenant.mockResolvedValueOnce([{content_sha256:'hash'}]);mocks.tenant.mockResolvedValue([]);
 mocks.learn.mockRejectedValue(new Error('timeout'));
 await processMailboxWork();
 expect(mocks.learn).toHaveBeenCalledOnce();
 expect(mocks.tenant.mock.calls.at(-1)?.[2]).toContain('uncertain');
});
it('keeps whole-range sync counts across bounded pages',async()=>{
 mocks.query.mockResolvedValue([{id:'job',user_id:'owner',lease_token:'token'}]);
 mocks.tenant.mockImplementation((_user:string,sql:string)=>{
  if(sql.includes('select kind,target_id,payload'))return Promise.resolve([{kind:'sync',target_id:'00000000-0000-4000-8000-000000000001',payload:{connectionId:'00000000-0000-4000-8000-000000000001',folderScope:'both',from:'2026-10-01',through:'2026-10-15'}}]);
  if(sql.includes('select id from mailbox_work_job'))return Promise.resolve([{id:'job'}]);
  return Promise.resolve([]);
 });
 mocks.sync.mockResolvedValueOnce({imported:100,skipped:0,discovered:150});
 mocks.sync.mockResolvedValueOnce({imported:50,skipped:0,discovered:50});
 mocks.sync.mockResolvedValueOnce({imported:0,skipped:0,discovered:0});
 await processMailboxWork();
 expect(mocks.sync).toHaveBeenCalledTimes(3);
 const progress=mocks.tenant.mock.calls.filter(call=>String(call[1]).includes('set result=$4'));
 expect(progress.map(call=>JSON.parse(call[2][3]))).toEqual([
  {imported:100,processed:100,discovered:150,remaining:50},
  {imported:150,processed:150,discovered:150,remaining:0},
  {imported:150,processed:150,discovered:150,remaining:0},
 ]);
});
