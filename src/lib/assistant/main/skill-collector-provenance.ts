import {z} from 'zod';
import {digest} from './contracts';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
const proof=z.object({
 ownerId:z.uuid(),bundleId:z.uuid(),freezeId:z.uuid(),artifactHash:sha,
 sourceKind:z.literal('production-runner-pending-verification'),
 trustRegistryLocked:z.literal(true),trustRegistryHash:sha,
 currentRuntimeIdentityHash:sha,frozenRuntimeIdentityHash:sha,
 declaration:z.object({runnerDeclarationRequired:z.literal(true),runnerDeclarationRevalidated:z.literal(true),
  runnerDeclarationId:z.uuid(),runnerStatementHash:sha,runnerRegistryHash:sha}),
 transports:z.object({transportReceiptsRequired:z.literal(true),transportReceiptsRevalidated:z.literal(true),
  transportRegistryHash:sha,transportAuditHash:sha,transportOriginalTaskCount:z.number().int().positive(),
  transportEvaluationArmCount:z.number().int().positive(),transportReceiptCount:z.number().int().positive()}),
 coverage:z.object({signingEnrollmentCoverageRequired:z.literal(true),signingEnrollmentCoverageRevalidated:z.literal(true),
  signingEnrollmentCount:z.number().int().min(3).max(300),signingEnrollmentCoverageHash:sha}),
 packages:z.object({runtimePackagesRequired:z.literal(true),runtimePackagesRegistered:z.literal(true),
  runtimePackageCount:z.number().int().min(3).max(300),runtimePackageRegistrationHash:sha,
  runtimePackageRevisions:z.array(z.string().regex(/^[1-9][0-9]*$/)).min(3).max(300),
  runtimePackageBytesPairRevalidated:z.literal(true),runtimePackageBytesPairHash:sha,
  runtimeModuleFormatPairRevalidated:z.literal(true)}),
});

/** Internal composition of authenticated, retained reader results; not a
 * signature/package verifier and never accepts tool/HTTP proof input. Authenticates
 * registered collector provenance, not provider truth, graph equivalence or quality. */
export function qualifySkillCollectorProvenance(input:unknown){
 const parsed=proof.safeParse(input);
 const blocked=(reason:string)=>({collectorProvenanceVerified:false as const,collectorProvenanceBlockers:[reason]});
 if(!parsed.success)return blocked('registered-collector-proof-incomplete');
 const value=parsed.data;
 if(value.trustRegistryHash!==value.declaration.runnerRegistryHash||value.trustRegistryHash!==value.transports.transportRegistryHash)
  return blocked('collector-trust-snapshots-differ');
 if(value.currentRuntimeIdentityHash!==value.frozenRuntimeIdentityHash)return blocked('collector-current-runtime-identity-changed');
 const {packages,coverage}=value;
 if(packages.runtimePackageCount!==coverage.signingEnrollmentCount
  ||packages.runtimePackageRevisions.length!==coverage.signingEnrollmentCount
  ||new Set(packages.runtimePackageRevisions).size!==packages.runtimePackageRevisions.length)
  return blocked('collector-package-coverage-incomplete');
 return {collectorProvenanceVerified:true as const,collectorProvenanceBlockers:[] as string[],
  collectorProvenanceHash:digest({protocol:'skill-registered-collector-provenance-v1',...value})};
}
