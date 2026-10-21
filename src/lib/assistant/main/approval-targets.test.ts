import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantQuery:m.query}));
import {withApprovalTargets} from './approval-targets';
const owner='11111111-1111-4111-8111-111111111111',document='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',hash='b'.repeat(64);
const approval={id:'approval',tool_id:'knowledge_private_delete',payload:{documentId:document,expectedHash:hash},parameter_hash:'unchanged'};
beforeEach(()=>{vi.resetAllMocks();m.query.mockResolvedValue([{id:document,title:'Owned document',content_sha256:hash}]);});
it('uses the actor and one deduplicated query; preserves exact approval parameters',async()=>{
 const result=await withApprovalTargets(owner,[approval,approval]);
 expect(m.query).toHaveBeenCalledOnce();expect(m.query.mock.calls[0][0]).toBe(owner);expect(m.query.mock.calls[0][2]).toEqual([owner,[document]]);
 expect(result[0]).toEqual({...approval,target:{kind:'private-knowledge',state:'current',title:'Owned document'}});
 expect(result[0].payload).toBe(approval.payload);expect(approval).not.toHaveProperty('target');
});
it('reports changed content without changing the stored expected hash',async()=>{
 m.query.mockResolvedValue([{id:document,title:'New revision',content_sha256:'c'.repeat(64)}]);
 expect((await withApprovalTargets(owner,[approval]))[0]).toEqual({...approval,target:{kind:'private-knowledge',state:'changed',title:'New revision'}});
});
it('does not infer a missing/foreign/shared title from the supplied payload',async()=>{
 m.query.mockResolvedValue([]);
 expect((await withApprovalTargets(owner,[approval]))[0].target).toEqual({kind:'private-knowledge',state:'unavailable'});
});
it.each([{documentId:'not-a-uuid',expectedHash:hash},{documentId:document,expectedHash:'invalid'},{...approval.payload,title:'Forged document title'}])('rejects malformed or expanded payloads without querying %j',async payload=>{
 const rows=await withApprovalTargets(owner,[{...approval,payload}]);expect(rows[0].target).toEqual({kind:'private-knowledge',state:'unavailable'});expect(m.query).not.toHaveBeenCalled();
});
it('canonicalizes UUID aliases and leaves unrelated approval types untouched',async()=>{
 const other={tool_id:'mail_send',payload:{to:'synthetic@example.invalid'}};
 const rows=await withApprovalTargets(owner,[{...approval,payload:{...approval.payload,documentId:document.toUpperCase()}},other]);
 expect(rows[0].target?.state).toBe('current');expect(rows[1]).toBe(other);
});
it('does no lookup for other tools and propagates database failure instead of cached titles',async()=>{
 await withApprovalTargets(owner,[{tool_id:'mail_send',payload:{}}]);expect(m.query).not.toHaveBeenCalled();
 m.query.mockRejectedValue(new Error('unavailable'));await expect(withApprovalTargets(owner,[approval])).rejects.toThrow('unavailable');
});
