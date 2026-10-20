import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {digest} from '../../src/lib/assistant/main/contracts';
import {skillSourceRuntimeHash} from '../../src/lib/assistant/main/skill-runtime-identity';
import {skillRuntimePackageInspectionSchema,skillRuntimePackageRegistrationSchema,skillRuntimePublicKeyHash} from '../../src/lib/assistant/main/skill-runtime-package-schema';
import {skillRunnerTrustRegistrySchema} from '../../src/lib/assistant/main/skill-runner-trust-registry-schema';
import {compareInspectedSkillRuntimeBytes} from '../../src/lib/assistant/main/skill-runtime-package-pair';

/** Disposable engineering fixture only. Measurements must come from actual
 * immutable images; signatures/model results and human quality remain synthetic. */
export async function measuredFixtureRuntimePackages(){
 const path=process.env.MA24_MEASURED_RUNTIME_PACKAGES_FILE;if(!path)return null;
 assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');assert.equal(process.platform,'linux');
 const pair=z.object({mainInspection:skillRuntimePackageInspectionSchema,collectorInspection:skillRuntimePackageInspectionSchema})
  .parse(JSON.parse(await readFile(path,'utf8')));
 assert.equal(pair.mainInspection.role,'main-agent');assert.equal(pair.collectorInspection.role,'skill-collector');
 const comparison=compareInspectedSkillRuntimeBytes([{purpose:'task-model-transport',inspection:pair.mainInspection},
  ...(['model-transport','runner-declaration'] as const).map(purpose=>({purpose,inspection:pair.collectorInspection}))]);
 assert.equal(comparison.runtimePackageBytesPairRevalidated,true);assert.equal(comparison.runtimeModuleFormatPairRevalidated,true);
 assert.equal(pair.collectorInspection.runtimeHash,await skillSourceRuntimeHash(),'Archived runtime differs from actual image measurement');
 return pair;
}
export async function registerMeasuredFixtureKey(pool:Pool,keyInput:unknown,inspection:z.infer<typeof skillRuntimePackageInspectionSchema>){
 assert.equal(process.env.MA24_DISPOSABLE_TRANSPORT_JOURNAL,'1');
 const key=skillRunnerTrustRegistrySchema.parse({protocol:'skill-runner-trust-registry-v1',keys:[keyInput]}).keys[0];
 assert.equal(key.deploymentHash,inspection.deploymentHash);
 const purposes=inspection.role==='main-agent'?['task-model-transport'] as const:['model-transport','runner-declaration'] as const;
 for(const purpose of purposes){
  assert(key.purposes.includes(purpose));
  const registration=skillRuntimePackageRegistrationSchema.parse({protocol:'skill-runtime-package-registration-v1',
   binding:{keyId:key.keyId,collectorId:key.collectorId,deploymentHash:key.deploymentHash,purpose,publicKeyHash:skillRuntimePublicKeyHash(key.publicKeyPem)},
   inspection,validUntil:key.expiresAt});
  const result=await pool.query('select register_skill_runtime_package($1,$2,$3,null) revision',[registration,digest(registration),randomUUID()]);
  assert(BigInt(result.rows[0].revision)>BigInt(0));
 }
}
