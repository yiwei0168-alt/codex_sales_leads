import {expect,it} from 'vitest';
import {skillAcceptanceRunIds} from './skill-acceptance-run-locks';
const runId='00000000-0000-4000-8000-000000000001';
const artifact={plan:{cases:[{id:'replay',provenance:'historical-task'},{id:'shadow',provenance:'prospective-task'},{id:'safe',provenance:'safety-fixture'}]},
 rawReceipts:{baselineSources:{replay:{runId}},candidateSources:{replay:{runId}},prospectiveSources:{shadow:{runId}},safetySources:{safe:{runId}}}};
it('derives and deduplicates runs across all stored source families',()=>{
 expect(skillAcceptanceRunIds(artifact)).toEqual([runId]);
});
it('rejects a historical candidate bound to a different run',()=>{
 expect(()=>skillAcceptanceRunIds({...artifact,rawReceipts:{...artifact.rawReceipts,candidateSources:{replay:{runId:'00000000-0000-4000-8000-000000000002'}}}})).toThrow('arm sources differ');
});
it('rejects missing references and unsupported provenance',()=>{
 expect(()=>skillAcceptanceRunIds({...artifact,rawReceipts:{}})).toThrow();
 expect(()=>skillAcceptanceRunIds({...artifact,plan:{cases:[{id:'x',provenance:'invented'}]}})).toThrow('Unsupported');
 expect(()=>skillAcceptanceRunIds({...artifact,plan:{cases:[]}})).toThrow();
});
