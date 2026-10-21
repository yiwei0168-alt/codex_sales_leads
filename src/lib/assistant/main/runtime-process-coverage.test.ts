import {expect,it} from 'vitest';
import {digest} from './contracts';
import {bindRuntimeProcessesToPackages,summarizeRuntimeProcessCoverage,transportRuntimeProcessRecord,runtimeProcessRecordSchema,type RuntimeProcessRecord} from './runtime-process-coverage';
import {skillRuntimePackageRegistrationSchema} from './skill-runtime-package-schema';

function fixture(){
 const registrations=(['main-agent','skill-collector'] as const).map(role=>{
  const paths=role==='main-agent'?['start.mjs','worker.mjs','server.mjs']:['start.mjs','runner.mjs'];
  return skillRuntimePackageRegistrationSchema.parse({protocol:'skill-runtime-package-registration-v1',binding:{
   keyId:role,collectorId:role,deploymentHash:digest(role),purpose:role==='main-agent'?'task-model-transport':'model-transport',publicKeyHash:digest('key')},
   inspection:{role,imageId:`sha256:${digest(role+'image')}`,sourceCommit:'a'.repeat(40),deploymentHash:digest(role),runtimeHash:digest('runtime'),
    nodeSha256:digest('node'),node:'24.21.0',platform:'linux',arch:'x64',sourceInputs:1,files:10,
    executionArtifacts:paths.map(path=>({path,sha256:digest(role+path)}))},validUntil:'2026-10-22T00:00:00.000Z'});
 });
 const claims:RuntimeProcessRecord[]=registrations.flatMap(pkg=>{
  const {publicKeyHash:unused,...signingEnrollment}=pkg.binding;void unused;
  const role=pkg.inspection.role,entry=role==='main-agent'?'start.mjs':'runner.mjs',artifact=role==='main-agent'?'worker.mjs':'runner.mjs';
  return [0,1].map(index=>runtimeProcessRecordSchema.parse({statementHash:digest(role+index),signingEnrollment,
   proof:{protocol:'local-runtime-process-v1',role,deploymentHash:pkg.binding.deploymentHash,nodeSha256:digest('node'),
    entry,entrySha256:digest(role+entry),artifact,artifactSha256:digest(role+artifact)}}));
 });
 return {registrations,coverage:{receiptHashes:claims.map(row=>row.statementHash),claims}};
}
it('binds each original/candidate success and fallback statement to its own registered role and artifact bytes',()=>{
 const {registrations,coverage}=fixture(),out=bindRuntimeProcessesToPackages(registrations,coverage);
 expect(out).toMatchObject({runtimeProcessPackagesRevalidated:true,runtimeProcessBoundReceiptCount:4,runtimeProcessPackageBlockers:[]});
 expect(out).not.toHaveProperty('productionAgentEquivalent');expect(out).not.toHaveProperty('automaticActivation');
 expect(summarizeRuntimeProcessCoverage(coverage)).toMatchObject({runtimeProcessCoverageComplete:true,runtimeProcessMissingClaimCount:0});
});
it('preserves legacy signature verification without inventing a process statement',()=>{
 const {registrations,coverage}=fixture(),first=coverage.claims[0];
 coverage.claims[0]=transportRuntimeProcessRecord({statementHash:first.statementHash,signingEnrollment:first.signingEnrollment});
 expect(summarizeRuntimeProcessCoverage(coverage)).toMatchObject({runtimeProcessCoverageComplete:false,runtimeProcessMissingClaimCount:1});
 expect(bindRuntimeProcessesToPackages(registrations,coverage)).toMatchObject({runtimeProcessPackagesRevalidated:false,runtimeProcessPackageBlockers:['runtime-process-claim-missing']});
});
it.each(['missing','extra','reordered','duplicate'])('rejects %s receipt coverage rather than qualifying a successful subset',kind=>{
 const {coverage}=fixture();
 if(kind==='missing')coverage.claims.pop();if(kind==='extra')coverage.claims.push(coverage.claims[0]);
 if(kind==='reordered')coverage.claims.reverse();if(kind==='duplicate')coverage.receiptHashes[1]=coverage.receiptHashes[0];
 expect(()=>summarizeRuntimeProcessCoverage(coverage)).toThrow('coverage changed');
});
it.each(['node','entry','artifact','deployment','role','enrollment'])('blocks mismatched %s identity',kind=>{
 const {registrations,coverage}=fixture(),claim=coverage.claims[0],proof=claim.proof!;
 if(kind==='node')proof.nodeSha256=digest('other');if(kind==='entry')proof.entrySha256=digest('other');
 if(kind==='artifact')proof.artifactSha256=digest('other');if(kind==='deployment')proof.deploymentHash=digest('other');
 if(kind==='enrollment')claim.signingEnrollment.keyId='other';
 if(kind==='role')claim.proof={...proof,role:'skill-collector',entry:'runner.mjs',artifact:'runner.mjs',entrySha256:digest('runner'),artifactSha256:digest('runner')};
 expect(bindRuntimeProcessesToPackages(registrations,coverage).runtimeProcessPackagesRevalidated).toBe(false);
});
it('requires independently registered artifacts and never chooses a convenient duplicate registration',()=>{
 const {registrations,coverage}=fixture();
 delete registrations[0].inspection.executionArtifacts;
 expect(bindRuntimeProcessesToPackages(registrations,coverage)).toMatchObject({runtimeProcessPackagesRevalidated:false,runtimeProcessPackageBlockers:['runtime-process-artifact-registration-missing']});
 const fresh=fixture();
 expect(bindRuntimeProcessesToPackages([...fresh.registrations,fresh.registrations[0]],fresh.coverage).runtimeProcessPackagesRevalidated).toBe(false);
 expect(bindRuntimeProcessesToPackages(fresh.registrations).runtimeProcessPackagesRevalidated).toBe(false);
});
it('rejects duplicate, incomplete and cross-role artifact registrations',()=>{
 const {registrations}=fixture(),pkg=registrations[0],entries=pkg.inspection.executionArtifacts!;
 for(const changed of [[entries[0],entries[0],entries[2]],entries.slice(1),[{path:'runner.mjs',sha256:digest('runner')},entries[0]]])
  expect(()=>skillRuntimePackageRegistrationSchema.parse({...pkg,inspection:{...pkg.inspection,executionArtifacts:changed}})).toThrow();
});
it('changes the binding fingerprint with a new registration, even when the executable bytes agree',()=>{
 const {registrations,coverage}=fixture(),before=bindRuntimeProcessesToPackages(registrations,coverage);
 registrations[0].validUntil='2026-10-23T00:00:00.000Z';
 const after=bindRuntimeProcessesToPackages(registrations,coverage);
 if(!before.runtimeProcessPackagesRevalidated||!after.runtimeProcessPackagesRevalidated)throw new Error('Expected component binding');
 expect(after.runtimeProcessPackageBindingHash).not.toBe(before.runtimeProcessPackageBindingHash);
});
