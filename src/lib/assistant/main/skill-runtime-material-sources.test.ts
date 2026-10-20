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

it('includes prospective task and capture identity without replacing original run identity',()=>{
 const prospective={caseId:'shadow',jobId:id(4),evaluationId:id(5),runId:id(6),taskId:id(7),sourceProjectionHash:'b'.repeat(64),baselineProjectionHash:'c'.repeat(64),candidateProjectionHash:'d'.repeat(64)};
 const artifact={plan:{cases:[...plan.cases,{id:'shadow',provenance:'prospective-task'}]},rawReceipts:{candidateSources:{case:ref},prospectiveSources:{shadow:prospective}}};
 expect(skillRuntimeMaterialReferences(artifact)).toEqual([{caseId:'case',runId:id(1),evaluationId:id(2),taskId:id(3)},
  {caseId:'shadow',runId:id(6),evaluationId:id(5),taskId:id(7),prospectiveJobId:id(4),prospectiveProjectionHash:'b'.repeat(64)}]);
 expect(()=>skillRuntimeMaterialReferences({...artifact,rawReceipts:{...artifact.rawReceipts,prospectiveSources:{shadow:{...prospective,caseId:'wrong'}}}})).toThrow('case binding');
 expect(()=>skillRuntimeMaterialReferences({...artifact,rawReceipts:{...artifact.rawReceipts,prospectiveSources:{shadow:{...prospective,taskId:id(3)}}}})).toThrow('duplicate');
});

it('retains both distinct safety arms and rejects partial or reused task identities',()=>{
 const safety={caseId:'safe',runId:id(1),evaluationId:id(2),baselineTaskId:id(8),candidateTaskId:id(9),baselineProjectionHash:'a'.repeat(64),candidateProjectionHash:'b'.repeat(64)};
 const artifact={plan:{cases:[{id:'safe',provenance:'safety-fixture'}]},rawReceipts:{safetySources:{safe:safety}}};
 expect(skillRuntimeMaterialReferences(artifact)).toEqual([
  {caseId:'safe',runId:id(1),evaluationId:id(2),taskId:id(8),safetyCaseId:'safe',arm:'baseline'},
  {caseId:'safe',runId:id(1),evaluationId:id(2),taskId:id(9),safetyCaseId:'safe',arm:'candidate'}]);
 for(const changed of [{...safety,candidateTaskId:undefined},{...safety,candidateTaskId:id(8)}])
  expect(()=>skillRuntimeMaterialReferences({...artifact,rawReceipts:{safetySources:{safe:changed}}})).toThrow('distinct pair');
});
