import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({bytes:vi.fn(),query:vi.fn()}));
vi.mock('./skill-attachment-bytes',()=>({revalidateLockedKnowledgeAssetBytes:m.bytes}));
import {revalidateLockedSkillKnowledgeReceiptBytes as check} from './skill-knowledge-receipt-bytes';
const owner=randomUUID(),asset=randomUUID(),chunk=randomUUID(),node=randomUUID();
const client={query:m.query} as unknown as PoolClient;
const receipt=(tool:string,data:unknown)=>({tool,output:{status:'success',data}});
beforeEach(()=>{vi.resetAllMocks();m.bytes.mockImplementation(async(_c:unknown,_u:unknown,ids:string[])=>({count:new Set(ids).size,manifestHash:'manifest'}));});
it('deduplicates original document candidates and permits the legacy array output',async()=>{
 const out=await check(client,owner,[receipt('knowledge_originals',{documents:[{id:asset},{id:asset}]}),receipt('knowledge_originals',[{id:asset}])]);
 expect(out).toMatchObject({knowledgeReceiptBytesRevalidated:true,knowledgeReceiptAssetCount:1});
 expect(m.bytes).toHaveBeenCalledExactlyOnceWith(client,owner,[asset]);expect(m.query).not.toHaveBeenCalled();
});
it.each(['knowledge_search','knowledge_facts','knowledge_compare'])('maps %s chunks to their registered v3 originals',async tool=>{
 const evidence={id:chunk,metadata:{releaseId:randomUUID()}},fact={chunkId:chunk};
 const data=tool==='knowledge_search'?[evidence]:tool==='knowledge_facts'?[fact]:{entities:[{evidence:[evidence],verifiedFacts:[fact]}]};
 m.query.mockResolvedValue({rows:[{id:chunk,asset_id:asset,kind:'v3'}]});
 expect(await check(client,owner,[receipt(tool,data)])).toMatchObject({knowledgeReceiptAssetCount:1});
 expect(m.query.mock.calls[0][1]).toEqual([[chunk],owner]);expect(m.bytes).toHaveBeenCalledWith(client,owner,[asset]);
});
it('maps current vectorless evidence nodes to their originals',async()=>{
 m.query.mockResolvedValue({rows:[{id:node,asset_id:asset,kind:'tree'}]});
 await check(client,owner,[receipt('vectorless_read',{evidence:{id:node}})]);
 expect(m.query.mock.calls[0][0]).toContain('d.current_tree_version_id=v.id');expect(m.bytes).toHaveBeenCalledWith(client,owner,[asset]);
});
it('preserves existing database-only legacy chunks and revision trees without inventing files',async()=>{
 m.query.mockResolvedValueOnce({rows:[{id:chunk,asset_id:null,kind:'legacy'}]}).mockResolvedValueOnce({rows:[{id:node,asset_id:null,kind:'tree'}]});
 expect(await check(client,owner,[receipt('knowledge_search',[{id:chunk}]),receipt('vectorless_read',{evidence:{id:node}})]))
  .toMatchObject({knowledgeReceiptAssetCount:0,knowledgeReceiptDatabaseOnlyCount:2});
});
it('rejects missing current mappings',async()=>{
 m.query.mockResolvedValue({rows:[]});await expect(check(client,owner,[receipt('knowledge_facts',[{chunkId:chunk}])])).rejects.toThrow('source unavailable');
 expect(m.bytes).not.toHaveBeenCalled();
});
it('rejects substituting a legacy source for a recorded v3 fact',async()=>{
 m.query.mockResolvedValue({rows:[{id:chunk,asset_id:null,kind:'legacy'}]});
 await expect(check(client,owner,[receipt('knowledge_facts',[{chunkId:chunk}])])).rejects.toThrow('source unavailable');
});
it('rejects ambiguous cross-store UUID mappings',async()=>{
 m.query.mockResolvedValue({rows:[{id:chunk,asset_id:asset,kind:'v3'},{id:chunk,asset_id:null,kind:'legacy'}]});
 await expect(check(client,owner,[receipt('knowledge_search',[{id:chunk}])])).rejects.toThrow('source unavailable');
});
it('propagates changed file bytes instead of returning a partial pass',async()=>{
 m.bytes.mockRejectedValue(new Error('Acceptance attachment bytes changed'));
 await expect(check(client,owner,[receipt('knowledge_originals',{documents:[{id:asset}]})])).rejects.toThrow('bytes changed');
});
it('rejects malformed source IDs before database lookup or filesystem reads',async()=>{
 await expect(check(client,owner,[receipt('knowledge_originals',{documents:[{id:'../secret'}]})])).rejects.toThrow();
 expect(m.query).not.toHaveBeenCalled();expect(m.bytes).not.toHaveBeenCalled();
});
it('ignores unrelated read domains and empty evidence',async()=>{
 expect(await check(client,owner,[receipt('mail_read',{text:'private'}),receipt('vectorless_read',{evidence:null})]))
  .toMatchObject({knowledgeReceiptAssetCount:0,knowledgeReceiptDatabaseOnlyCount:0});
 expect(m.query).not.toHaveBeenCalled();
});
it('preserves the real partial no-accessible-originals result without inventing an asset',async()=>{
 expect(await check(client,owner,[{tool:'knowledge_originals',output:{status:'partial',data:{kind:'insufficient-evidence',reason:'no-accessible-match'}}}]))
  .toMatchObject({knowledgeReceiptAssetCount:0});
 expect(m.query).not.toHaveBeenCalled();
});
