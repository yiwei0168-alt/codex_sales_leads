import {it,expect} from 'vitest';
import {MODEL,VERSION,atomicRoute,type AtomicResponse,type AtomicPolicy} from './contract';
import {routeV2,selectV2,type PolicyV2,type Row} from './admission-v2';
function answer(choice:'yes'|'no',p=0.96){return {type:'choice' as const,choice,confidence:0.8,
  probabilities:{yes:choice==='yes'?p:1-p,no:choice==='no'?p:1-p,unclear:0}};}
function response(route:string):AtomicResponse{return {id:'test',model:MODEL,usage:{input_tokens:1,output_tokens:1},
  answers:{requires_planning:answer(route==='dynamic_agent'?'yes':'no'),fixed_fit:answer(route==='fixed_workflow'?'yes':'no'),batch_fit:answer(route==='interpreter'?'yes':'no')}};}
const rule={enabled:true,planning:{probability:0.8,margin:0.2},fit:{probability:0.8,margin:0.2}};
const policy:PolicyV2={version:'jev-atomic-admission-v2',contractVersion:VERSION,fixedWorkflow:'atomic-v1-preserved',interpreter:rule};
it('decouples exclusion probability from affirmative fit without ignoring conflicts',()=>{
  const r=response('interpreter');r.answers.fixed_fit=answer('no',0.6);
  expect(routeV2(r,policy)).toBe('interpreter');r.answers.fixed_fit=answer('yes');expect(routeV2(r,policy)).toBe('dynamic_agent');
  r.answers.fixed_fit={...answer('no'),choice:'unclear',probabilities:{yes:0.02,no:0.02,unclear:0.96}};
  expect(routeV2(r,policy)).toBe('dynamic_agent');
});
it('keeps planning veto, separate probability thresholds and invalid policy fallback',()=>{
  const r=response('interpreter');r.answers.requires_planning=answer('yes');expect(routeV2(r,policy)).toBe('dynamic_agent');
  r.answers.requires_planning=answer('no',0.79);expect(routeV2(r,policy)).toBe('dynamic_agent');
  r.answers.requires_planning=answer('no');r.answers.batch_fit=answer('yes',0.79);expect(routeV2(r,policy)).toBe('dynamic_agent');
  expect(routeV2(response('interpreter'),{...policy,version:'unknown'} as unknown as PolicyV2)).toBe('dynamic_agent');
});
it('compares old and new admission on exactly the same response',()=>{
  const r=response('interpreter');r.answers.batch_fit=answer('yes',0.88);
  const old:AtomicPolicy={version:'old',contractVersion:VERSION,routes:{fixed_workflow:{enabled:true,probability:0.5,margin:0.05},interpreter:{enabled:true,probability:0.9,margin:0.5}}};
  expect(atomicRoute(r,old)).toBe('dynamic_agent');expect(routeV2(r,policy)).toBe('interpreter');
});
it('requires both development groups and chooses a plateau center rather than the strictest tied threshold',()=>{
  const rows:Row[]=(['development','exposed-validation'] as const).flatMap(group=>Array.from({length:48},(_,i)=>{
    const expected=i<12?'fixed_workflow':i<24?'interpreter':'dynamic_agent';return {group,id:String(i),expected,response:response(expected)};}));
  const selected=selectV2(rows);expect(selected.policy.interpreter.fit.probability).toBeLessThan(0.95);
  expect(selected.details.every(d=>d.worstGroupCoverage===1)).toBe(true);
  expect(()=>selectV2(rows.filter(r=>r.group==='development'))).toThrow();expect(()=>selectV2([...rows,rows[0]])).toThrow();
  // A confidently mislabeled negative prevents learning an unsafe shortcut.
  rows[24].response=response('interpreter');expect(selectV2(rows).policy.interpreter.enabled).toBe(false);
},20000);
it('preserves the previous fixed query admission even below the new planning threshold',()=>{
  const r=response('fixed_workflow');r.answers.requires_planning=answer('no',0.6);
  expect(routeV2(r,policy)).toBe('fixed_workflow');
});
