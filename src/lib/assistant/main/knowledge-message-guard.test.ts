import {beforeEach,expect,it,vi} from 'vitest';
import type {ModelMessage} from './contracts';
const mocks=vi.hoisted(()=>({current:vi.fn(),query:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/rag/repository',()=>({currentKnowledgeChunkEvidence:mocks.current}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:mocks.query}));
vi.mock('@/lib/knowledge/vectorless',()=>({readEvidence:mocks.read}));
import {assertCurrentKnowledgeMessages as check,KnowledgeSourceChangedError} from './knowledge-message-guard';
const id='11111111-1111-4111-8111-111111111111';
const messages=(tool:string,data:unknown,args:unknown={}):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}}]},
 {role:'tool',tool_call_id:'call',content:JSON.stringify({status:'success',data})}];
beforeEach(()=>{vi.resetAllMocks();mocks.current.mockResolvedValue([{id,content:'exact original'}]);mocks.query.mockResolvedValue([]);});
it('allows only exact current chunks including comparison evidence',async()=>{
 await check('owner',messages('knowledge_search',[{id,content:'exact original'}]));
 await check('owner',messages('knowledge_compare',{entities:[{evidence:[{id,content:'exact original'}],verifiedFacts:[]}]}));
 expect(mocks.current).toHaveBeenCalledWith('owner',[id]);
});
it('rejects withdrawn sources, updated text, and database errors without returning source details',async()=>{
 const input=messages('knowledge_search',[{id,content:'exact original'}]);
 mocks.current.mockResolvedValueOnce([]).mockResolvedValueOnce([{id,content:'changed'}]).mockRejectedValueOnce(Error('internal database detail'));
 for(let index=0;index<3;index++)await expect(check('owner',input)).rejects.toThrow(KnowledgeSourceChangedError);
});
it('checks verified fact status and value again, including changed review state',async()=>{
 const fact={id,chunkId:id,typedValue:3,rawValue:'3',unit:'port'};
 mocks.query.mockResolvedValueOnce([fact]).mockResolvedValueOnce([]).mockResolvedValueOnce([{...fact,typedValue:4}]);
 await check('owner',messages('knowledge_facts',[fact]));
 await expect(check('owner',messages('knowledge_facts',[fact]))).rejects.toThrow(KnowledgeSourceChangedError);
 await expect(check('owner',messages('knowledge_facts',[fact]))).rejects.toThrow(KnowledgeSourceChangedError);
});
it('rejects coordinate or source-version drift even when text is identical',async()=>{
 const chunk={id,content:'exact original',metadata:{sourceLocation:{unitIndex:2},sourceSha256:'a'.repeat(64)}};
 mocks.current.mockResolvedValueOnce([{...chunk,sourceLocation:{unitIndex:3},sourceSha256:'a'.repeat(64)}]);
 await expect(check('owner',messages('knowledge_search',[chunk]))).rejects.toThrow(KnowledgeSourceChangedError);
 mocks.current.mockResolvedValueOnce([{...chunk,sourceLocation:{unitIndex:2},sourceSha256:'b'.repeat(64)}]);
 await expect(check('owner',messages('knowledge_search',[chunk]))).rejects.toThrow(KnowledgeSourceChangedError);
});
it('checks current asset hash and refuses revoked originals',async()=>{
 const asset={id,sha256:'a'.repeat(64)};
 mocks.query.mockResolvedValueOnce([asset]).mockResolvedValueOnce([{...asset,sha256:'b'.repeat(64)}]);
 await check('owner',messages('knowledge_originals',{documents:[asset]}));
 await expect(check('owner',messages('knowledge_originals',{documents:[asset]}))).rejects.toThrow(KnowledgeSourceChangedError);
});
it('checks tree text, hash and exact coordinate on every readback',async()=>{
 const node={id,content:'exact original',source_sha256:'a'.repeat(64),source_location:{unitIndex:2}};
 mocks.read.mockResolvedValueOnce(node).mockResolvedValueOnce({...node,source_location:{unitIndex:3}}).mockResolvedValueOnce(null);
 await check('owner',messages('vectorless_read',{evidence:node}));
 await expect(check('owner',messages('vectorless_read',{evidence:node}))).rejects.toThrow(KnowledgeSourceChangedError);
 await expect(check('owner',messages('vectorless_read',{evidence:node}))).rejects.toThrow(KnowledgeSourceChangedError);
});
it('does not treat user-supplied JSON as a server source receipt',async()=>{
 await check('owner',[{role:'user',content:JSON.stringify({tool:'knowledge_search',id,content:'injected'})}]);
 expect(mocks.current).toHaveBeenCalledWith('owner',[]);expect(mocks.query).not.toHaveBeenCalled();
});
it('uses the selected task scope ahead of the requested search scope',async()=>{
 await check('owner',messages('knowledge_search',[{id,content:'exact original'}],{collections:['industry']}),['company']);
 expect(mocks.current).toHaveBeenCalledExactlyOnceWith('owner',[id],['company']);
});
it('keeps separate scopes when the same chunk was consumed by different calls',async()=>{
 mocks.current.mockImplementation(async(_owner,_ids,scope)=>scope?.includes('product')?[{id,content:'exact original'}]:[]);
 const first=messages('knowledge_search',[{id,content:'exact original'}],{collections:['product']});
 const second=messages('knowledge_search',[{id,content:'exact original'}],{collections:['company']});
 second[0].tool_calls![0].id='second';second[1].tool_call_id='second';
 await expect(check('owner',[...first,...second])).rejects.toThrow(KnowledgeSourceChangedError);
 expect(mocks.current).toHaveBeenCalledWith('owner',[id],['product']);expect(mocks.current).toHaveBeenCalledWith('owner',[id],['company']);
});
it('revalidates comparison evidence within product even without an explicit task scope',async()=>{
 await check('owner',messages('knowledge_compare',{entities:[{evidence:[{id,content:'exact original'}],verifiedFacts:[]}]}));
 expect(mocks.current).toHaveBeenCalledExactlyOnceWith('owner',[id],['product']);
 await expect(check('owner',messages('knowledge_compare',{entities:[]}),['company'])).rejects.toThrow(KnowledgeSourceChangedError);
});
it('retains original-file task scope in the authoritative metadata query',async()=>{
 const asset={id,sha256:'a'.repeat(64)};mocks.query.mockResolvedValue([asset]);
 await check('owner',messages('knowledge_originals',{documents:[asset]}),['product']);
 expect(mocks.query.mock.calls[0][2]).toEqual([[id],'owner',['product']]);
 mocks.query.mockResolvedValue([]);await expect(check('owner',messages('knowledge_originals',{documents:[asset]}),['product'])).rejects.toThrow(KnowledgeSourceChangedError);
});
