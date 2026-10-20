import {expect,it} from 'vitest';
import {qualifySkillCollectorProvenance} from './skill-collector-provenance';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const h='a'.repeat(64),other='b'.repeat(64);
const input={ownerId:id(1),bundleId:id(2),freezeId:id(3),artifactHash:h,sourceKind:'production-runner-pending-verification',
 trustRegistryLocked:true,trustRegistryHash:h,currentRuntimeIdentityHash:h,frozenRuntimeIdentityHash:h,
 declaration:{runnerDeclarationRequired:true,runnerDeclarationRevalidated:true,runnerDeclarationId:id(4),runnerStatementHash:h,runnerRegistryHash:h},
 transports:{transportReceiptsRequired:true,transportReceiptsRevalidated:true,transportRegistryHash:h,transportAuditHash:h,
  transportOriginalTaskCount:2,transportEvaluationArmCount:8,transportReceiptCount:10},
 coverage:{signingEnrollmentCoverageRequired:true,signingEnrollmentCoverageRevalidated:true,signingEnrollmentCount:3,signingEnrollmentCoverageHash:h},
 packages:{runtimePackagesRequired:true,runtimePackagesRegistered:true,runtimePackageCount:3,runtimePackageRegistrationHash:h,
  runtimePackageRevisions:['1','2','3'],runtimePackageBytesPairRevalidated:true,runtimePackageBytesPairHash:h,runtimeModuleFormatPairRevalidated:true}};
it('binds registered provenance without granting graph/provider/quality or activation claims',()=>{
 const out=qualifySkillCollectorProvenance(input);
 expect(out).toMatchObject({collectorProvenanceVerified:true,collectorProvenanceBlockers:[]});
 if(!out.collectorProvenanceVerified)throw new Error('Expected complete component proof');
 expect(out.collectorProvenanceHash).toMatch(/^[a-f0-9]{64}$/);
 for(const field of ['automaticActivation','productionAgentEquivalent','policyPassed','sourceRevocationsLocked'])expect(out).not.toHaveProperty(field);
 expect(qualifySkillCollectorProvenance({...input,privateBody:'discarded'})).toEqual(out);
 expect(qualifySkillCollectorProvenance({...input,artifactHash:other})).not.toHaveProperty('collectorProvenanceHash',out.collectorProvenanceHash);
});
it.each([
 {...input,sourceKind:'synthetic-fixture'}, {...input,trustRegistryLocked:false}, {...input,ownerId:'foreign-invalid'},
 {...input,declaration:{...input.declaration,runnerDeclarationRevalidated:false}},
 {...input,transports:{...input.transports,transportReceiptsRevalidated:false}},
 {...input,transports:{...input.transports,transportReceiptCount:0}},
 {...input,coverage:{...input.coverage,signingEnrollmentCoverageRevalidated:false}},
 {...input,packages:{...input.packages,runtimePackagesRegistered:false}},
 {...input,packages:{...input.packages,runtimePackageBytesPairRevalidated:false}},
 {...input,packages:{...input.packages,runtimeModuleFormatPairRevalidated:false}},
 {...input,packages:{...input.packages,runtimePackageBytesPairHash:undefined}},
])('rejects incomplete, synthetic or unregistered server proof %#',value=>{
 expect(qualifySkillCollectorProvenance(value)).toEqual({collectorProvenanceVerified:false,collectorProvenanceBlockers:['registered-collector-proof-incomplete']});
});
it.each(['declaration','transports'] as const)('rejects a different %s trust snapshot',field=>{
 const row=field==='declaration'?{...input.declaration,runnerRegistryHash:other}:{...input.transports,transportRegistryHash:other};
 expect(qualifySkillCollectorProvenance({...input,[field]:row}).collectorProvenanceBlockers).toEqual(['collector-trust-snapshots-differ']);
});
it('rejects a current runtime identity differing from the frozen sources',()=>{
 expect(qualifySkillCollectorProvenance({...input,currentRuntimeIdentityHash:other}).collectorProvenanceBlockers).toEqual(['collector-current-runtime-identity-changed']);
});
it.each([
 {...input.packages,runtimePackageCount:4}, {...input.packages,runtimePackageRevisions:['1','2','2']},
 {...input.packages,runtimePackageRevisions:['1','2','3','4']},
])('rejects incomplete or reused registration coverage %#',packages=>{
 expect(qualifySkillCollectorProvenance({...input,packages}).collectorProvenanceBlockers).toEqual(['collector-package-coverage-incomplete']);
});
