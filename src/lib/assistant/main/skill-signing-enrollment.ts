import {z} from 'zod';
import {digest} from './contracts';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const skillSigningEnrollmentSchema=z.object({
 keyId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/),
 collectorId:z.string().min(1).max(200),deploymentHash:sha,
 purpose:z.enum(['runner-declaration','model-transport','task-model-transport']),
}).strict();
export type SkillSigningEnrollment=z.infer<typeof skillSigningEnrollmentSchema>;
export const skillSigningEnrollmentWindowSchema=skillSigningEnrollmentSchema.extend({requiredFrom:z.iso.datetime(),requiredThrough:z.iso.datetime()})
 .refine(row=>Date.parse(row.requiredFrom)<=Date.parse(row.requiredThrough),'Signing enrollment time range invalid');
export type SkillSigningEnrollmentWindow=z.infer<typeof skillSigningEnrollmentWindowSchema>;
export function mergeSkillSigningEnrollmentWindows(values:readonly unknown[]){
 if(!Array.isArray(values))throw new Error('Signing enrollment windows unavailable');
 const rows=values.map(value=>skillSigningEnrollmentWindowSchema.parse(value));
 const identities=mergeSkillSigningEnrollments(rows.map(({keyId,collectorId,deploymentHash,purpose})=>({keyId,collectorId,deploymentHash,purpose})));
 return identities.map(identity=>{
  const matching=rows.filter(row=>row.keyId===identity.keyId&&row.purpose===identity.purpose);
  return {...identity,requiredFrom:new Date(Math.min(...matching.map(row=>Date.parse(row.requiredFrom)))).toISOString(),
   requiredThrough:new Date(Math.max(...matching.map(row=>Date.parse(row.requiredThrough)))).toISOString()};
 });
}

/** Only aggregate results of actual signature verifiers. This projection is not
 * a signature verifier, package certification or production qualification. */
export function mergeSkillSigningEnrollments(values:readonly unknown[]){
 if(!Array.isArray(values))throw new Error('Signing enrollment coverage unavailable');
 const keys=new Map<string,string>(),unique=new Map<string,SkillSigningEnrollment>();
 for(const value of values){
  const row=skillSigningEnrollmentSchema.parse(value),identity=digest({collectorId:row.collectorId,deploymentHash:row.deploymentHash});
  if(keys.has(row.keyId)&&keys.get(row.keyId)!==identity)throw new Error('Signing enrollment identity changed');
  keys.set(row.keyId,identity);unique.set(`${row.keyId}:${row.purpose}`,row);
  if(keys.size>100)throw new Error('Signing enrollment registry size exceeded');
 }
 return [...unique.values()].sort((a,b)=>a.keyId===b.keyId?(a.purpose<b.purpose?-1:a.purpose>b.purpose?1:0):a.keyId<b.keyId?-1:1);
}

/** Call inside the retained readiness transaction, with server-generated
 * verifier results only. No HTTP/tool input is accepted by this component. */
export function skillSigningEnrollmentCoverage(runner:{runnerDeclarationRequired:boolean;runnerDeclarationRevalidated:boolean;runnerRegistryHash?:string;runnerSigningEnrollment?:unknown;runnerSigningEnrollmentWindow?:unknown},
 transport:{transportReceiptsRequired:boolean;transportReceiptsRevalidated:boolean;transportRegistryHash?:string;transportSigningEnrollments?:readonly unknown[];transportSigningEnrollmentWindows?:readonly unknown[]}){
 if(!runner.runnerDeclarationRequired&&!transport.transportReceiptsRequired)return {
  signingEnrollmentCoverageRequired:false as const,signingEnrollmentCoverageRevalidated:false as const};
 if(!runner.runnerDeclarationRequired||!runner.runnerDeclarationRevalidated||!transport.transportReceiptsRequired||!transport.transportReceiptsRevalidated)
  throw new Error('Signing enrollment coverage requires both verified source roles');
 const registryHash=sha.parse(runner.runnerRegistryHash);
 if(registryHash!==transport.transportRegistryHash)throw new Error('Signing enrollment trust snapshots differ');
 const declaration=skillSigningEnrollmentSchema.parse(runner.runnerSigningEnrollment);
 if(declaration.purpose!=='runner-declaration')throw new Error('Runner signing enrollment purpose changed');
 const receipts=mergeSkillSigningEnrollments(transport.transportSigningEnrollments!);
 if(receipts.some(row=>row.purpose==='runner-declaration')||!receipts.some(row=>row.purpose==='task-model-transport')
  ||!receipts.some(row=>row.purpose==='model-transport'))throw new Error('Signing enrollment transport role missing or invalid');
 const enrollments=mergeSkillSigningEnrollments([declaration,...receipts]);
 const windows=mergeSkillSigningEnrollmentWindows([runner.runnerSigningEnrollmentWindow,...(transport.transportSigningEnrollmentWindows??[])]);
 if(digest(windows.map(({keyId,collectorId,deploymentHash,purpose})=>({keyId,collectorId,deploymentHash,purpose})))!==digest(enrollments))
  throw new Error('Signing enrollment window coverage changed');
 return {signingEnrollmentCoverageRequired:true as const,signingEnrollmentCoverageRevalidated:true as const,
  signingEnrollments:enrollments,signingEnrollmentWindows:windows,signingEnrollmentCount:enrollments.length,
  signingEnrollmentCoverageHash:digest({protocol:'skill-signing-enrollment-coverage-v2',registryHash,enrollments,windows})};
}
