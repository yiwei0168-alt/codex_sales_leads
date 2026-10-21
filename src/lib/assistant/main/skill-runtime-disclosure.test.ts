import {beforeEach,expect,it,vi} from 'vitest';
import {digest,result,type ModelMessage} from './contracts';
import {assertSkillRuntimeModelDisclosure,isDisclosedReadSubset} from './skill-runtime-disclosure';
const m=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),assets:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({tenantTransaction:m.transaction}));
vi.mock('./skill-knowledge-receipt-bytes',()=>({resolveLockedSkillKnowledgeReceiptAssets:m.assets}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=id(1),asset=id(2),candidate=id(3);
beforeEach(()=>{
 m.query.mockReset().mockImplementation(async(sql:string)=>({rows:sql.includes('externally_disclosable')?[{id:asset}]:[]}));
 m.transaction.mockReset().mockImplementation(async(_owner:string,work:(client:unknown)=>Promise<unknown>)=>work({query:m.query}));
 m.assets.mockReset().mockResolvedValue({assetIds:[asset],databaseOnlyCount:0});
});
const frame=(tool:string,output:unknown,args:Record<string,unknown>={}):ModelMessage[]=>[
 {role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'execute_tool',arguments:JSON.stringify({tool,arguments:args})}}]},
 {role:'tool',tool_call_id:'read',content:JSON.stringify(output)},
];
function snapshot(tool:string,output:unknown){
 const receipt={tool,arguments:{},output};
 return {candidate:{listing:{id:candidate}},receipts:[{...receipt,hash:digest(receipt)}]} as unknown as Parameters<typeof assertSkillRuntimeModelDisclosure>[2];
}
it('allows a fresh query to expose only a complete-record subset already consumed by the original task',async()=>{
 const original=result({items:[{id:id(4),name:'Private synthetic customer'}],countries:[{country:'unknown',count:1}],hasMore:false},{cost:'known',callId:id(5)});
 const next=result({items:[],countries:[{country:'unknown',count:1}],hasMore:false},{cost:'known',callId:id(6)});
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('customer_timeline',next,{offset:1}),snapshot('customer_timeline',original))).resolves.toBeUndefined();
 expect(m.transaction).not.toHaveBeenCalled();
});
it('blocks new private rows even when old rows are present in the same result',async()=>{
 const original=result({items:[{id:id(4),name:'Already disclosed'}]},{cost:'known'});
 const next=result({items:[{id:id(4),name:'Already disclosed'},{id:id(7),name:'New private customer'}]},{cost:'known'});
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('customer_timeline',next),snapshot('customer_timeline',original))).rejects.toThrow('explicit external disclosure');
 expect(m.assets).not.toHaveBeenCalled();
});
it('does not let new metadata disclose a private source outside the data field',async()=>{
 const original=result([],{cost:'known'}),next=result([],{cost:'known',sources:[{title:'New private mail title',url:'private-source'}]});
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('mail_read',next),snapshot('mail_read',original))).rejects.toThrow('explicit external disclosure');
});
it('rejects a fabricated original receipt hash before treating its data as previously disclosed',async()=>{
 const output=result([]),saved=snapshot('mail_read',output);saved.receipts[0].hash='b'.repeat(64);
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('mail_read',output),saved)).rejects.toThrow('explicit external disclosure');
});
it('requires current explicit public-asset permission for new knowledge evidence',async()=>{
 const saved=snapshot('knowledge_search',result([])),next=result([{id:id(8),content:'New public synthetic evidence'}],{cost:'known'});
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('knowledge_search',next),saved)).resolves.toBeUndefined();
 expect(m.transaction).toHaveBeenCalledWith(owner,expect.any(Function));
 const sql=m.query.mock.calls.find(([sql])=>sql.includes('externally_disclosable'))![0];
 expect(sql).toContain("source_nature like 'public-%'");expect(sql).toContain("visibility='shared'");
});
it('rejects new database-only evidence lacking an explicit asset disclosure grant',async()=>{
 m.assets.mockResolvedValue({assetIds:[],databaseOnlyCount:1});
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('knowledge_search',result([{id:id(8),content:'Claimed public evidence'}])),snapshot('knowledge_search',result([])))).rejects.toThrow('explicit external disclosure');
});
it.each([{rows:[]},{rows:[{id:id(99)}]}])('rejects missing or different authorized asset rows',async({rows})=>{
 m.query.mockImplementation(async()=>({rows}));
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('knowledge_search',result([{id:id(8),content:'New evidence'}])),snapshot('knowledge_search',result([])))).rejects.toThrow('explicit external disclosure');
});
it('does not send newly disclosed public evidence that still requires PII redaction',async()=>{
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('knowledge_search',result([{id:id(8),content:'Contact private-person@example.invalid'}])),snapshot('knowledge_search',result([])))).rejects.toThrow('explicit external disclosure');
 expect(m.assets).not.toHaveBeenCalled();
});
it('permits only the already selected virtual candidate overlay, not arbitrary private Skill files',async()=>{
 const saved=snapshot('knowledge_search',result([])),output=result({files:{'SKILL.md':'Selected trial instructions'}});
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('skill_read',output,{id:candidate}),saved)).resolves.toBeUndefined();
 await expect(assertSkillRuntimeModelDisclosure({userId:owner},frame('skill_read',output,{id:id(88)}),saved)).rejects.toThrow('explicit external disclosure');
});
it('keeps structural disclosure comparisons bound to fields, full strings and complete array records',()=>{
 expect(isDisclosedReadSubset({notes:'private'}, {email:'private'})).toBe(false);
 expect(isDisclosedReadSubset({notes:'part'}, {notes:'part of private text'})).toBe(false);
 expect(isDisclosedReadSubset([{id:1}], [{id:1,secret:'private'}])).toBe(false);
 expect(isDisclosedReadSubset([1,1], [1])).toBe(false);
 expect(isDisclosedReadSubset({items:[]}, {items:[{id:1}]})).toBe(true);
});
