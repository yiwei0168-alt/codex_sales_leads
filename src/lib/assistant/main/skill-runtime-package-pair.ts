import {digest} from './contracts';
import {z} from 'zod';
import {skillRuntimePackageRegistrationSchema,skillRuntimePackageInspectionSchema} from './skill-runtime-package-schema';

/** Consumes already authenticated/locked registrations. Matching source, Node
 * and dependency bytes is necessary, but does not certify loader semantics,
 * provider identity, host deployment or answer quality. Never grants activation. */
export function compareSkillRuntimePackageBytes(registrations:readonly unknown[]){
 const rows=registrations.map(value=>skillRuntimePackageRegistrationSchema.parse(value));
 return compareInspectedSkillRuntimeBytes(rows.map(row=>({purpose:row.binding.purpose,inspection:row.inspection})));
}
/** Local byte comparison, not registration authentication or execution proof. */
export function compareInspectedSkillRuntimeBytes(input:readonly unknown[]){
 const schema=z.object({purpose:z.enum(['task-model-transport','model-transport','runner-declaration']),inspection:skillRuntimePackageInspectionSchema}).strict();
 const rows=input.map(value=>schema.parse(value));
 for(const row of rows)if(row.inspection.role!==(row.purpose==='task-model-transport'?'main-agent':'skill-collector'))throw new Error('Runtime pair inspection role mismatch');
 const blockers=new Set<string>();
 for(const purpose of ['task-model-transport','model-transport','runner-declaration'])
  if(!rows.some(row=>row.purpose===purpose))blockers.add(`missing-package-purpose:${purpose}`);
 for(const row of rows)if(!row.inspection.dependencyManifestHash)blockers.add('dependency-inventory-unavailable');
 const identities=rows.map(({inspection:p})=>({sourceCommit:p.sourceCommit,runtimeHash:p.runtimeHash,sourceInputs:p.sourceInputs,
  node:p.node,nodeSha256:p.nodeSha256,platform:p.platform,arch:p.arch,
  dependencyManifestHash:p.dependencyManifestHash??null,dependencyFiles:p.dependencyFiles??null}));
 if(new Set(identities.map(digest)).size>1)blockers.add('runtime-package-byte-identities-differ');
 return {runtimePackageBytesPairRevalidated:blockers.size===0,runtimePackageBytesPairBlockers:[...blockers].sort(),
  ...(blockers.size===0?{runtimePackageBytesPairHash:digest({protocol:'skill-runtime-package-bytes-pair-v1',identities})}:{})};
}
