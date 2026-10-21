import {createHash,createPublicKey} from 'node:crypto';
import {z} from 'zod';
import {skillSigningEnrollmentSchema} from './skill-signing-enrollment';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export function skillRuntimePublicKeyHash(pem:string){
 const key=createPublicKey(pem);if(key.asymmetricKeyType!=='ed25519')throw new Error('Runtime package enrollment requires Ed25519');
 return createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
export const skillRuntimePackageInspectionSchema=z.object({
 role:z.enum(['main-agent','skill-collector']),imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),
 deploymentHash:sha,runtimeHash:sha,nodeSha256:sha,node:z.string().regex(/^\d+\.\d+\.\d+$/),platform:z.literal('linux'),arch:z.enum(['x64','arm64']),
 sourceInputs:z.number().int().positive(),files:z.number().int().positive(),
 dependencyManifestHash:sha.optional(),dependencyFiles:z.number().int().positive().optional(),
 runtimeModuleFormat:z.enum(['esm','cjs']).optional(),
 executionArtifacts:z.array(z.object({path:z.enum(['start.mjs','runner.mjs','worker.mjs','server.mjs']),sha256:sha}).strict()).min(2).max(3).optional(),
}).strict().superRefine((row,context)=>{
 if((row.dependencyManifestHash===undefined)!==(row.dependencyFiles===undefined))context.addIssue({code:'custom',message:'Runtime dependency inventory incomplete'});
 if(row.dependencyFiles!==undefined&&row.dependencyFiles>row.files)context.addIssue({code:'custom',message:'Runtime dependency count exceeds package inventory'});
 if(row.executionArtifacts){
  const paths=row.executionArtifacts.map(value=>value.path).sort(),expected=row.role==='main-agent'?['server.mjs','start.mjs','worker.mjs']:['runner.mjs','start.mjs'];
  if(JSON.stringify(paths)!==JSON.stringify(expected))context.addIssue({code:'custom',message:'Runtime execution artifact coverage differs from role'});
 }
});
export const skillRuntimePackageRegistrationSchema=z.object({protocol:z.literal('skill-runtime-package-registration-v1'),
 binding:skillSigningEnrollmentSchema.extend({publicKeyHash:sha}),inspection:skillRuntimePackageInspectionSchema,validUntil:z.iso.datetime(),
}).strict().superRefine((row,context)=>{
 if(row.binding.deploymentHash!==row.inspection.deploymentHash)context.addIssue({code:'custom',message:'Runtime package deployment differs from signing enrollment'});
 const required=row.binding.purpose==='task-model-transport'?'main-agent':'skill-collector';
 if(row.inspection.role!==required)context.addIssue({code:'custom',message:'Runtime package role does not cover signing purpose'});
});
