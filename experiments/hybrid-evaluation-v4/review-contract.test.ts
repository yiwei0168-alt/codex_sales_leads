import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {blindInputs,parseReview} from './review-contract';
it('supplies only ID/state to a separate reviewer, never author labels or observations',()=>{
 const cases=JSON.parse(readFileSync('experiments/hybrid-evaluation-v1/routing-cases.json','utf8')).filter((c:{split:string})=>c.split==='holdout');
 const inputs=blindInputs(cases);expect(inputs).toHaveLength(64);
 expect(inputs.every(c=>Object.keys(c).sort().join(',')==='id,state')).toBe(true);
 expect(JSON.stringify(inputs)).not.toContain('initialRoute');
});
it('accepts complete structured review and rejects duplicate/missing/foreign IDs',()=>{
 const rows=[{id:'a',route:'interpreter',reason:'Executable segment'},{id:'b',route:'dynamic_agent',reason:'Unresolved intent'}];
 expect(parseReview(JSON.stringify(rows),['a','b'])).toEqual(rows);
 for(const bad of [[rows[0],rows[0]],[rows[0]],[rows[0],{...rows[1],id:'c'}]])expect(()=>parseReview(JSON.stringify(bad),['a','b'])).toThrow();
});
