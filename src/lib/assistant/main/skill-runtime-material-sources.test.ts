import {expect,it} from 'vitest';
import {skillRuntimeMaterialReferences} from './skill-runtime-material-sources';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const plan={cases:[{id:'case',provenance:'historical-task'}]};
const ref={runId:id(1),evaluationId:id(2),projectionHash:'a'.repeat(64),taskId:id(3)};
it('keeps legacy origin-only locking fixtures unchanged',()=>{
 expect(skillRuntimeMaterialReferences({plan,rawReceipts:{candidateSources:{case:{runId:id(1)}}}})).toEqual([]);
});
it('derives runtime tasks from stored historical references only',()=>{
 expect(skillRuntimeMaterialReferences({plan,rawReceipts:{candidateSources:{case:ref}}})).toEqual([{caseId:'case',runId:id(1),evaluationId:id(2),taskId:id(3)}]);
});
it('rejects duplicated task identity and malformed task markers',()=>{
 expect(()=>skillRuntimeMaterialReferences({plan:{cases:[...plan.cases,{id:'other',provenance:'historical-task'}]},rawReceipts:{candidateSources:{case:ref,other:ref}}})).toThrow('duplicate');
 expect(()=>skillRuntimeMaterialReferences({plan,rawReceipts:{candidateSources:{case:{...ref,taskId:'invalid'}}}})).toThrow();
});
