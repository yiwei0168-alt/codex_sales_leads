import {expect,it,vi} from 'vitest';
import type {ExecutionContext} from './contracts';
import type {SkillCandidateCollector} from './skill-candidate-model';
import {runSkillRuntimeCandidate} from './skill-runtime-candidate';

it('rejects a quota/selection mismatch before acquiring leases or creating a request',async()=>{
 const request=vi.fn(),transaction=vi.fn(),id='00000000-0000-4000-8000-000000000001';
 const pin={runId:id,skillId:id,version:1,freezeId:id,caseId:'synthetic',evaluationId:id,arm:'candidate' as const,maximumModelCalls:3};
 const collector={request,transaction} as unknown as SkillCandidateCollector;
 await expect(runSkillRuntimeCandidate({} as ExecutionContext,pin,collector,4)).rejects.toThrow('model quota does not match task selection');
 expect(request).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
});
