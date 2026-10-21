import {z} from 'zod';
import {digest} from './contracts';
import {runtimeProcessProofSchema} from './runtime-process-proof-schema';
import {skillSigningEnrollmentSchema} from './skill-signing-enrollment';
import {skillRuntimePackageRegistrationSchema} from './skill-runtime-package-schema';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const runtimeProcessRecordSchema=z.object({statementHash:sha,
 signingEnrollment:skillSigningEnrollmentSchema.extend({purpose:z.enum(['task-model-transport','model-transport'])}),
 proof:runtimeProcessProofSchema.nullable()}).strict();
export type RuntimeProcessRecord=z.infer<typeof runtimeProcessRecordSchema>;

/** Only from a successful signature verifier, never a submitted verdict. Null
 * explicitly preserves an old receipt's lack of a process statement. */
export function transportRuntimeProcessRecord(checked:{statementHash:string;signingEnrollment:unknown;runtimeProcessClaim?:unknown}):RuntimeProcessRecord{
 return runtimeProcessRecordSchema.parse({statementHash:checked.statementHash,signingEnrollment:checked.signingEnrollment,
  proof:checked.runtimeProcessClaim??null});
}
export type RuntimeProcessCoverage={receiptHashes:readonly string[];claims:readonly unknown[]};
export function summarizeRuntimeProcessCoverage(input:RuntimeProcessCoverage){
 const receiptHashes=z.array(sha).min(1).max(10000).parse(input.receiptHashes),claims=z.array(runtimeProcessRecordSchema).max(10000).parse(input.claims);
 if(new Set(receiptHashes).size!==receiptHashes.length||digest(claims.map(row=>row.statementHash))!==digest(receiptHashes))
  throw new Error('Runtime process receipt coverage changed');
 const missing=claims.filter(row=>row.proof===null).length;
 return {claims,runtimeProcessReceiptCount:receiptHashes.length,runtimeProcessMissingClaimCount:missing,
  runtimeProcessCoverageComplete:missing===0,runtimeProcessCoverageHash:digest({protocol:'runtime-process-coverage-v1',receiptHashes,claims})};
}

/** Package registrations must already be authenticated, time-checked and retained
 * under the publication lock. This component does not qualify business effects,
 * provider truthfulness, full task coverage or ordinary lifecycle equivalence. */
export function bindRuntimeProcessesToPackages(rawPackages:readonly unknown[],input?:RuntimeProcessCoverage){
 const blocked=(reason:string)=>({runtimeProcessPackagesRevalidated:false as const,runtimeProcessPackageBlockers:[reason]});
 if(!input)return blocked('runtime-process-coverage-unavailable');
 const coverage=summarizeRuntimeProcessCoverage(input);
 const packages=rawPackages.map(row=>skillRuntimePackageRegistrationSchema.parse(row));
 const bindings=[];
 for(const claim of coverage.claims){
  if(!claim.proof)return blocked('runtime-process-claim-missing');
  const proof=claim.proof,binding=claim.signingEnrollment;
  const matches=packages.filter(pkg=>pkg.binding.keyId===binding.keyId&&pkg.binding.collectorId===binding.collectorId
   &&pkg.binding.deploymentHash===binding.deploymentHash&&pkg.binding.purpose===binding.purpose);
  if(matches.length!==1)return blocked('runtime-process-package-ambiguous-or-missing');
  const registration=matches[0],inspection=registration.inspection;
  if(proof.role!==inspection.role||proof.deploymentHash!==inspection.deploymentHash)return blocked('runtime-process-package-role-or-deployment-mismatch');
  if(proof.nodeSha256!==inspection.nodeSha256)return blocked('runtime-process-node-mismatch');
  if(!inspection.executionArtifacts)return blocked('runtime-process-artifact-registration-missing');
  const artifacts=new Map(inspection.executionArtifacts.map(row=>[row.path,row.sha256]));
  if(artifacts.get(proof.entry)!==proof.entrySha256||artifacts.get(proof.artifact)!==proof.artifactSha256)
   return blocked('runtime-process-entry-or-artifact-mismatch');
  bindings.push({statementHash:claim.statementHash,proofHash:digest(proof),registrationHash:digest(registration)});
 }
 return {runtimeProcessPackagesRevalidated:true as const,runtimeProcessPackageBlockers:[] as string[],
  runtimeProcessBoundReceiptCount:bindings.length,runtimeProcessPackageBindingHash:digest({
   protocol:'runtime-process-package-binding-v1',coverageHash:coverage.runtimeProcessCoverageHash,bindings})};
}
