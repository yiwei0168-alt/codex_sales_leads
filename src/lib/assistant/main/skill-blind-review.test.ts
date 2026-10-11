import {expect,it} from 'vitest';
import {presentBlindPairs} from './skill-blind-review';
const source={snapshot:{suite:{cases:[{id:'c',question:'Ports?',receipts:[{content:'2 RJ45',page:3}]}]}},result:{pairs:[{caseId:'c',baseline:{status:'completed',reply:'Two',messages:['secret prompt'],model:'provider-a'},candidate:{status:'completed',reply:'2',stopReason:'blocked',messages:['Skill package']}}]}};
it('whitelists anonymous fields and swaps both answer and completion state',()=>{
 const normal=presentBlindPairs(source,{c:false})[0],swapped=presentBlindPairs(source,{c:true})[0];expect(normal.A.answer).toBe('Two');expect(swapped.A.answer).toBe('2');expect(swapped.A.canPass).toBe(false);expect(swapped.B.canPass).toBe(true);
 const text=JSON.stringify(swapped);for(const secret of ['baseline','candidate','secret prompt','provider-a','Skill package','messages'])expect(text).not.toContain(secret);expect(swapped.receipts).toEqual(source.snapshot.suite.cases[0].receipts);
});
it('refuses incomplete server arm assignment',()=>{expect(()=>presentBlindPairs(source,{})).toThrow('binding');});
