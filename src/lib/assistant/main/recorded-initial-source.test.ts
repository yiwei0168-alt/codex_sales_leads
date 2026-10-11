import {beforeEach,expect,it,vi} from 'vitest';
import {modeModelConfig} from './mode-config';
import {initialTaskMessages} from './initial-task-messages';
import {decisionMemoryMessage} from './decision-memory-message';
const db=vi.hoisted(()=>({query:vi.fn(),owner:''}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:async(owner:string,fn:(client:unknown)=>Promise<unknown>)=>{db.owner=owner;return fn({query:db.query});}}));
import {bindRecordedInitialSource} from './recorded-initial-source';
const context={userId:'owner',runId:'run'},config=modeModelConfig('standard');
const asset='00000000-0000-4000-8000-000000000001';
const input={content:'Synthetic task',attachments:[{assetId:asset}]};
const history=[{id:'history',role:'assistant' as const,content:'Prior answer'}];
const task={instructions:[{content:'First clarification'}],input,model_config:config,conversation_id:'conversation',role:'member' as const};
function messages(){const m=initialTaskMessages({...context,role:'member',mode:'standard'},input,config,history);return [m[0],decisionMemoryMessage([]),...m.slice(1)];}
beforeEach(()=>{
 db.query.mockReset().mockResolvedValueOnce({rows:[task]}).mockResolvedValueOnce({rows:[{id:'original',content:input.content}]}).mockResolvedValueOnce({rows:history}).mockResolvedValueOnce({rows:[{id:asset,source_sha256:'a'.repeat(64)}]});
});
it('binds the initial content, prior messages and currently accessible attachment in the account transaction',async()=>{
 const value=await bindRecordedInitialSource(context,messages());expect(value.initialConversationProvenanceVerified).toBe(true);expect(db.owner).toBe('owner');
 expect(db.query.mock.calls[2][1]).toEqual(['owner','conversation','run']);
 expect(db.query.mock.calls[3][1]).toEqual([[asset],'owner']);
 expect(db.query.mock.calls[3][0]).toContain("d.status='active'");expect(db.query.mock.calls[3][0]).toContain('v.asset_id=a.id');
});
it('rejects changed prior conversation and fabricated attachment identifiers',async()=>{
 const m=messages();m[2].content='Altered earlier answer';await expect(bindRecordedInitialSource(context,m)).rejects.toThrow('conversation changed');
});
it('rejects unavailable, revoked or superseded attachments',async()=>{
 db.query.mockReset().mockResolvedValueOnce({rows:[task]}).mockResolvedValueOnce({rows:[{id:'original',content:input.content}]}).mockResolvedValueOnce({rows:history}).mockResolvedValueOnce({rows:[]});
 await expect(bindRecordedInitialSource(context,messages())).rejects.toThrow('attachment unavailable');
});
it('rejects a deleted original message or unavailable conversation',async()=>{
 db.query.mockReset().mockResolvedValueOnce({rows:[task]}).mockResolvedValueOnce({rows:[]});
 await expect(bindRecordedInitialSource(context,messages())).rejects.toThrow('original user message');
 db.query.mockReset().mockResolvedValueOnce({rows:[]});await expect(bindRecordedInitialSource(context,messages())).rejects.toThrow('unavailable');
});

it('binds instructions appended before the first decision',async()=>{
 const value=await bindRecordedInitialSource(context,[...messages(),{role:'user',content:'First clarification'}]);expect(value.initialInstructionCount).toBe(1);
});
