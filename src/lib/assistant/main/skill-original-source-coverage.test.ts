import {expect,it} from 'vitest';
import {ZodError} from 'zod';
import {OriginalSourcesPendingError,requireOriginalSourceCoverage} from './skill-original-source-coverage';
const runId='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const cases=[{id:'replay',provenance:'historical-task'},{id:'shadow',provenance:'prospective-task'},{id:'safety',provenance:'safety-fixture'}];
const complete=()=>({plan:{cases},observations:cases.map(row=>({caseId:row.id})),rawReceipts:{baselineSources:{replay:{runId}},candidateSources:{replay:{runId}},prospectiveSources:{shadow:{runId}},safetySources:{safety:{runId}}}});
it('retains complete historical, prospective and safety reference validation',()=>{
 expect(()=>requireOriginalSourceCoverage(complete())).not.toThrow();
 const unobserved=complete();unobserved.observations=[];expect(()=>requireOriginalSourceCoverage(unobserved)).not.toThrow();
});
it('reports only uncollected cases with absent references as pending',()=>{
 const partial={plan:{cases},observations:[{caseId:'replay'}],rawReceipts:{baselineSources:{replay:{runId}},candidateSources:{replay:{runId}}}};
 try{requireOriginalSourceCoverage(partial);throw new Error('Expected pending sources');}
 catch(error){expect(error).toBeInstanceOf(OriginalSourcesPendingError);expect(error).toMatchObject({missingCaseCount:2});}
});
it('does not label missing references for an observed case as pending',()=>{
 const invalid={plan:{cases},observations:[{caseId:'shadow'}],rawReceipts:{baselineSources:{replay:{runId}},candidateSources:{replay:{runId}}}};
 expect(()=>requireOriginalSourceCoverage(invalid)).toThrow('Collected original source reference missing');
});
it('does not hide malformed present references behind other pending cases',()=>{
 const invalid={plan:{cases},observations:[],rawReceipts:{baselineSources:{replay:{runId:'not-a-uuid'}}}};
 expect(()=>requireOriginalSourceCoverage(invalid)).toThrow(ZodError);
});
it('retains historical arm matching even when another case is pending',()=>{
 const invalid={plan:{cases},observations:[],rawReceipts:{baselineSources:{replay:{runId}},candidateSources:{replay:{runId:other}}}};
 expect(()=>requireOriginalSourceCoverage(invalid)).toThrow('Locked historical arm sources differ');
});
it('does not treat null reference groups as uncollected',()=>{
 expect(()=>requireOriginalSourceCoverage({plan:{cases},observations:[],rawReceipts:{baselineSources:null}})).toThrow(ZodError);
});
it('retains rejection of empty or unsupported plans',()=>{
 expect(()=>requireOriginalSourceCoverage({plan:{cases:[]},observations:[],rawReceipts:{}})).toThrow(ZodError);
 expect(()=>requireOriginalSourceCoverage({plan:{cases:[{id:'x',provenance:'unknown'}]},observations:[],rawReceipts:{}})).toThrow('Unsupported original source provenance');
});
