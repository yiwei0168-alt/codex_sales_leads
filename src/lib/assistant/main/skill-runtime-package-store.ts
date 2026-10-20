import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {configuredSkillRunnerTrustRegistryMode} from './skill-runner-attestation';
import {readLockedSkillRunnerTrustRegistry} from './skill-runner-trust-registry-store';
import {mergeSkillSigningEnrollmentWindows} from './skill-signing-enrollment';
import {skillRuntimePackageRegistrationSchema,skillRuntimePublicKeyHash} from './skill-runtime-package-schema';
import {compareSkillRuntimePackageBytes} from './skill-runtime-package-pair';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
/** Necessary package-registration component, not provider/quality certification.
 * Retain admission until the owning transaction finishes. Never use a fallback
 * registration after latest-version withdrawal, expiry, rotation or mismatch. */
export async function readLockedSkillRuntimePackages(client:PoolClient,userId:string,input:{registryHash:string;runtimeHash:string;windows:readonly unknown[]}){
 hash.parse(input.registryHash);hash.parse(input.runtimeHash);
 const windows=mergeSkillSigningEnrollmentWindows(input.windows);if(!windows.length)throw new Error('Runtime package signing coverage empty');
 return withBoundTenantTransaction(client,userId,async()=>{
  const blocked=(reason:string)=>({runtimePackagesRequired:true as const,runtimePackagesRegistered:false as const,runtimePackageBlockers:[reason]});
  if(configuredSkillRunnerTrustRegistryMode()!=='database')return blocked('database-trust-required');
  const trust=await readLockedSkillRunnerTrustRegistry(client,userId);
  if(trust.registryHash!==input.registryHash)throw new Error('Runtime package signing trust changed');
  const supported=(await client.query<{supported:boolean}>("select to_regclass('public.skill_runtime_package_registration') is not null and to_regclass('public.skill_runtime_package_withdrawal') is not null supported")).rows[0]?.supported;
  if(!supported)return blocked('registration-schema-unavailable');
  const admitted=(await client.query<{admitted:boolean}>("select pg_try_advisory_xact_lock_shared(hashtextextended('skill-runtime-packages-v1',0)) admitted")).rows[0]?.admitted;
  if(!admitted)return blocked('package-publication-in-progress');
  const registrations:Array<{revision:string;registrationHash:string;windowHash:string}>=[],expiries:string[]=[];
  const packages:Array<z.infer<typeof skillRuntimePackageRegistrationSchema>>=[];
  for(const window of windows){
   const key=trust.registry.keys.find(row=>row.keyId===window.keyId);
   if(!key?.enabled||!key.purposes.includes(window.purpose)||key.collectorId!==window.collectorId||key.deploymentHash!==window.deploymentHash)
    throw new Error('Runtime package signing enrollment changed');
   const row=(await client.query<{revision:string;key_id:string;purpose:string;registration:unknown;registration_hash:string;withdrawn:boolean}>(`select r.revision::text,r.key_id,r.purpose,r.registration,r.registration_hash,
    exists(select 1 from public.skill_runtime_package_withdrawal w where w.registration_revision=r.revision) withdrawn
    from public.skill_runtime_package_registration r where r.key_id=$1 and r.purpose=$2 order by r.revision desc limit 1`,[window.keyId,window.purpose])).rows[0];
   if(!row)return blocked('package-registration-missing');if(row.withdrawn)return blocked('latest-package-registration-withdrawn');
   const registration=skillRuntimePackageRegistrationSchema.parse(row.registration),binding=registration.binding;
   if(digest(registration)!==row.registration_hash||row.key_id!==binding.keyId||row.purpose!==binding.purpose)throw new Error('Runtime package registration digest changed');
   if(binding.keyId!==window.keyId||binding.purpose!==window.purpose||binding.collectorId!==window.collectorId||binding.deploymentHash!==window.deploymentHash
    ||binding.publicKeyHash!==skillRuntimePublicKeyHash(key.publicKeyPem))return blocked('latest-package-signing-identity-mismatch');
   if(registration.inspection.runtimeHash!==input.runtimeHash)return blocked('runtime-package-source-mismatch');
   // SQL compares the original registered_at precision, preventing a later
   // registration in the same millisecond from qualifying an earlier attempt.
   const valid=(await client.query<{valid:boolean}>(`select registered_at>=$2::timestamptz and registered_at<$3::timestamptz
    and registered_at<=$4::timestamptz and $5::timestamptz<$6::timestamptz
    and $6::timestamptz<=$3::timestamptz and clock_timestamp()<least($3::timestamptz,$6::timestamptz) valid
    from public.skill_runtime_package_registration where revision=$1`,[row.revision,key.notBefore,key.expiresAt,window.requiredFrom,window.requiredThrough,registration.validUntil])).rows[0]?.valid;
   if(!valid)return blocked('package-registration-time-window');
   registrations.push({revision:row.revision,registrationHash:row.registration_hash,windowHash:digest(window)});expiries.push(registration.validUntil);packages.push(registration);
  }
  return {runtimePackagesRequired:true as const,runtimePackagesRegistered:true as const,runtimePackageBlockers:[] as string[],runtimePackageCount:registrations.length,
   runtimePackageRegistrationHash:digest(registrations),runtimePackageRevisions:registrations.map(row=>row.revision),
   runtimePackageValidBefore:new Date(Math.min(...expiries.map(Date.parse))).toISOString(),...compareSkillRuntimePackageBytes(packages)};
 });
}
