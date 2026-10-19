import {expect,it} from 'vitest';
import {digest} from './contracts';
import {mergeSkillSigningEnrollments,skillSigningEnrollmentCoverage} from './skill-signing-enrollment';

const registry=digest('registry');
const runner={keyId:'runner',collectorId:'collector',deploymentHash:digest('collector-package'),purpose:'runner-declaration' as const};
const task={keyId:'task',collectorId:'main-runtime',deploymentHash:digest('main-package'),purpose:'task-model-transport' as const};
const evaluation={keyId:'evaluation',collectorId:'collector',deploymentHash:digest('collector-package'),purpose:'model-transport' as const};
const declaration={runnerDeclarationRequired:true,runnerDeclarationRevalidated:true,runnerRegistryHash:registry,runnerSigningEnrollment:runner};
const transport={transportReceiptsRequired:true,transportReceiptsRevalidated:true,transportRegistryHash:registry,transportSigningEnrollments:[task,evaluation]};

it('binds the exact original, evaluation and declaration roles with deterministic deduplication',()=>{
 const out=skillSigningEnrollmentCoverage(declaration,transport);
 expect(out).toMatchObject({signingEnrollmentCoverageRequired:true,signingEnrollmentCoverageRevalidated:true,signingEnrollmentCount:3});
 expect(out.signingEnrollments).toEqual([evaluation,runner,task]);
 expect(skillSigningEnrollmentCoverage(declaration,{...transport,transportSigningEnrollments:[evaluation,task,evaluation]})).toEqual(out);
 expect(out).not.toHaveProperty('collectorProvenanceVerified');expect(out).not.toHaveProperty('automaticActivation');
});
it('retains separate fallback signing keys instead of qualifying only the selected route',()=>{
 const fallback={...task,keyId:'fallback',collectorId:'older-main',deploymentHash:digest('older-package')};
 expect(skillSigningEnrollmentCoverage(declaration,{...transport,transportSigningEnrollments:[task,evaluation,fallback]}).signingEnrollmentCount).toBe(4);
});
it('binds enrollment coverage to the current registry even with unchanged key identities',()=>{
 const changed=digest('new registry');
 expect(skillSigningEnrollmentCoverage({...declaration,runnerRegistryHash:changed},{...transport,transportRegistryHash:changed}).signingEnrollmentCoverageHash)
  .not.toBe(skillSigningEnrollmentCoverage(declaration,transport).signingEnrollmentCoverageHash);
});
it.each(['collectorId','deploymentHash'] as const)('rejects a key identity conflict across purposes in %s',field=>{
 expect(()=>mergeSkillSigningEnrollments([runner,{...runner,purpose:'model-transport',[field]:field==='deploymentHash'?digest('other'):'other'}])).toThrow('identity changed');
});
it.each([{name:'empty',values:[]},{name:'task-only',values:[task]},{name:'evaluation-only',values:[evaluation]},
 {name:'declaration-substitution',values:[task,evaluation,runner]}])('rejects missing or substituted transport roles $name',({values})=>{
 expect(()=>skillSigningEnrollmentCoverage(declaration,{...transport,transportSigningEnrollments:values})).toThrow('transport role');
});
it('rejects incomplete signature-role checks and missing or mismatched enrollment evidence',()=>{
 expect(()=>skillSigningEnrollmentCoverage({...declaration,runnerDeclarationRevalidated:false},transport)).toThrow('both verified source roles');
 expect(()=>skillSigningEnrollmentCoverage(declaration,{...transport,transportReceiptsRequired:false})).toThrow('both verified source roles');
 expect(()=>skillSigningEnrollmentCoverage(declaration,{...transport,transportRegistryHash:digest('other')})).toThrow('trust snapshots differ');
 expect(()=>skillSigningEnrollmentCoverage({...declaration,runnerSigningEnrollment:task},transport)).toThrow('purpose changed');
 expect(()=>skillSigningEnrollmentCoverage(declaration,{...transport,transportSigningEnrollments:undefined})).toThrow('coverage unavailable');
 expect(()=>mergeSkillSigningEnrollments([{...task,deploymentHash:'caller boolean'}])).toThrow();
});
it('does not claim verified coverage for synthetic unsigned preparation',()=>{
 expect(skillSigningEnrollmentCoverage({runnerDeclarationRequired:false,runnerDeclarationRevalidated:false},
  {transportReceiptsRequired:false,transportReceiptsRevalidated:false})).toEqual({signingEnrollmentCoverageRequired:false,signingEnrollmentCoverageRevalidated:false});
});
