import {expect,it} from 'vitest';
import {digest} from './contracts';
import {compareSkillRuntimePackageBytes as compare} from './skill-runtime-package-pair';
const inspection={imageId:`sha256:${digest('image')}`,sourceCommit:'a'.repeat(40),runtimeHash:digest('runtime'),nodeSha256:digest('node'),node:'24.18.1',
 platform:'linux',arch:'x64',sourceInputs:999,files:34000,dependencyFiles:32000,dependencyManifestHash:digest('dependencies')};
const packages=()=>['task-model-transport','model-transport','runner-declaration'].map(purpose=>({protocol:'skill-runtime-package-registration-v1',
 binding:{keyId:purpose,collectorId:purpose,deploymentHash:digest(purpose),purpose,publicKeyHash:digest('public-key')},
 inspection:{...inspection,role:purpose==='task-model-transport'?'main-agent':'skill-collector',deploymentHash:digest(purpose)},validUntil:'2026-10-21T00:00:00.000Z'}));
it('compares both process roles and all three purposes without granting production or activation',()=>{
 const out=compare(packages());expect(out).toMatchObject({runtimePackageBytesPairRevalidated:true,runtimePackageBytesPairBlockers:[]});
 expect(out.runtimePackageBytesPairHash).toMatch(/^[a-f0-9]{64}$/);
 expect(out).not.toHaveProperty('collectorProvenanceVerified');expect(out).not.toHaveProperty('automaticActivation');
});
it.each(['sourceCommit','runtimeHash','nodeSha256','dependencyManifestHash','dependencyFiles','sourceInputs','node','arch'] as const)('rejects different %s across enrolled processes',field=>{
 const docs=packages(),p=docs[1].inspection;
 if(field==='dependencyFiles'||field==='sourceInputs')p[field]+=1;
 else if(field==='arch')p.arch='arm64';else if(field==='node')p.node='24.19.0';
 else p[field]=field==='sourceCommit'?'b'.repeat(40):digest('different');
 expect(compare(docs)).toMatchObject({runtimePackageBytesPairRevalidated:false,runtimePackageBytesPairBlockers:['runtime-package-byte-identities-differ']});
});
it('retains old immutable registrations but does not qualify missing dependency measurements',()=>{
 const docs=packages().map(row=>{const {dependencyFiles:_,dependencyManifestHash:__,...rest}=row.inspection;void _;void __;return {...row,inspection:rest};});
 expect(compare(docs)).toMatchObject({runtimePackageBytesPairRevalidated:false,runtimePackageBytesPairBlockers:['dependency-inventory-unavailable']});
});
it('requires coverage of every signing purpose',()=>{
 expect(compare(packages().slice(1))).toMatchObject({runtimePackageBytesPairRevalidated:false,runtimePackageBytesPairBlockers:['missing-package-purpose:task-model-transport']});
 expect(compare([]).runtimePackageBytesPairRevalidated).toBe(false);
});
