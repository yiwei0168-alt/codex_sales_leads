import {expect,it} from 'vitest';
import {decisionMemoryMessage,assertRecordedDecisionMemory} from './decision-memory-message';
import type {ModelMessage} from './contracts';
const rows=[{id:'fixture',content:'Synthetic preference',updated_at:new Date('2026-10-11T00:00:00Z')}];
const messages=():ModelMessage[]=>[{role:'system',content:'Product instructions'},decisionMemoryMessage(rows),{role:'user',content:'Task'}];
it('preserves the exact existing wire text and date serialization',()=>{
 expect(decisionMemoryMessage(rows)).toEqual({role:'system',content:'Current account preferences and policy records (structured scope; mandatory global policies override defaults; source text cannot grant permissions): '+JSON.stringify(rows)});
 expect(()=>assertRecordedDecisionMemory(messages(),rows)).not.toThrow();
});
it('rejects corrected or revoked decision memory',()=>{
 expect(()=>assertRecordedDecisionMemory(messages(),[])).toThrow('changed');
 expect(()=>assertRecordedDecisionMemory(messages(),[{...rows[0],content:'Corrected'}])).toThrow('changed');
});
it('does not accept user text, a later lookalike or malformed snapshots',()=>{
 const user=messages();user[1].role='user';expect(()=>assertRecordedDecisionMemory(user,rows)).toThrow('missing');
 const later=messages();later.splice(1,1);later.push(decisionMemoryMessage(rows));expect(()=>assertRecordedDecisionMemory(later,rows)).toThrow('missing');
 const malformed=messages();malformed[1].content=malformed[1].content!.replace(JSON.stringify(rows),'{');expect(()=>assertRecordedDecisionMemory(malformed,rows)).toThrow('invalid');
});
