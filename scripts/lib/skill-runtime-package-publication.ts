import type {PoolClient} from 'pg';
import {z} from 'zod';
import {digest} from '../../src/lib/assistant/main/contracts';
import {skillRuntimePackageRegistrationSchema,skillRuntimePublicKeyHash} from '../../src/lib/assistant/main/skill-runtime-package-schema';
import {skillRunnerTrustRegistrySchema} from '../../src/lib/assistant/main/skill-runner-trust-registry-schema';
import {inspectSkillRuntimePackage} from './skill-runtime-package-inspection';

const revision=z.string().regex(/^(?:none|[1-9][0-9]*)$/);
const inputSchema=z.object({imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),keyId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/),
 purpose:z.enum(['task-model-transport','model-transport','runner-declaration']),validUntil:z.iso.datetime(),requestId:z.uuid(),expectedRevision:revision}).strict();

async function operatorTransaction(client:PoolClient){
 const state=async()=>(await client.query<{id:string;isolation:string;role:string;application:boolean}>(`select pg_current_xact_id()::text id,current_setting('transaction_isolation') isolation,
 current_user as role,pg_has_role(current_user,'network_copilot_app','member') or pg_has_role(current_user,'network_copilot_skill_collector','member') application`)).rows[0];
 const before=await state();
 // A superuser is allowed for explicit maintenance; application/collector roles
 // and members are rejected even if someone accidentally grants table writes.
 const superuser=(await client.query<{superuser:boolean}>('select rolsuper as superuser from pg_roles where rolname=current_user')).rows[0]?.superuser;
 if(!before||before.isolation!=='read committed'||before.application&&!superuser)throw new Error('Runtime publication requires an operator read-committed transaction');
 const check=async()=>{const after=await state();if(!after||after.id!==before.id||after.role!==before.role||after.isolation!==before.isolation)throw new Error('Runtime publication transaction changed');};
 await check();return check;
}

/** Operator-only. All image measurements are obtained here from actual Docker
 * execution. Callers cannot supply a registration document or measured hash. */
export async function publishSkillRuntimePackage(client:PoolClient,input:unknown){
 const spec=inputSchema.parse(input),check=await operatorTransaction(client);
 const inspection=inspectSkillRuntimePackage(spec.imageId,spec.purpose==='task-model-transport'?'main-agent':'skill-collector');
 await check();
 const admitted=(await client.query<{admitted:boolean}>("select pg_try_advisory_xact_lock_shared(hashtextextended('skill-runner-trust-registry-v1',0)) admitted")).rows[0]?.admitted;
 if(!admitted)throw new Error('Trust publication in progress; retry the whole operation');
 const row=(await client.query<{registry:unknown;registry_hash:string}>(`select v.registry,v.registry_hash from public.skill_runner_trust_registry_current c
 join public.skill_runner_trust_registry_version v on v.revision=c.revision where c.singleton`)).rows[0];
 if(!row)throw new Error('Runtime signing registry unavailable');
 const registry=skillRunnerTrustRegistrySchema.parse(row.registry);
 if(digest(registry)!==row.registry_hash)throw new Error('Runtime signing registry digest changed');
 const key=registry.keys.find(key=>key.keyId===spec.keyId);
 if(!key?.enabled||!key.purposes.includes(spec.purpose)||key.deploymentHash!==inspection.deploymentHash)throw new Error('Inspected runtime does not match active signing enrollment');
 const document=skillRuntimePackageRegistrationSchema.parse({protocol:'skill-runtime-package-registration-v1',binding:{keyId:key.keyId,collectorId:key.collectorId,
  deploymentHash:key.deploymentHash,purpose:spec.purpose,publicKeyHash:skillRuntimePublicKeyHash(key.publicKeyPem)},inspection,validUntil:spec.validUntil});
 const registrationHash=digest(document);
 // Native request idempotence is checked before expiry for reconciliation of an
 // already committed operation; changed request content still fails in SQL.
 const prior=(await client.query<{revision:string;registration_hash:string}>('select revision::text,registration_hash from public.skill_runtime_package_registration where request_id=$1',[spec.requestId])).rows[0];
 if(!prior){
  const valid=(await client.query<{valid:boolean}>(`select $1::timestamptz<=clock_timestamp() and clock_timestamp()<$2::timestamptz
   and clock_timestamp()<$3::timestamptz and $3::timestamptz<=$2::timestamptz valid`,[key.notBefore,key.expiresAt,document.validUntil])).rows[0]?.valid;
  if(!valid)throw new Error('Runtime registration outside active key lifetime');
 }
 const published=(await client.query<{revision:string}>('select public.register_skill_runtime_package($1,$2,$3,$4)::text revision',
  [document,registrationHash,spec.requestId,spec.expectedRevision==='none'?null:spec.expectedRevision])).rows[0]?.revision;
 const saved=(await client.query<{registration:unknown;registration_hash:string}>('select registration,registration_hash from public.skill_runtime_package_registration where revision=$1',[published])).rows[0];
 if(!published||!saved||saved.registration_hash!==registrationHash||digest(skillRuntimePackageRegistrationSchema.parse(saved.registration))!==registrationHash)throw new Error('Runtime publication readback changed');
 await check();return {revision:published,requestId:spec.requestId,registrationHash,inspection,validUntil:document.validUntil,idempotent:!!prior,productionQualified:false as const,automaticActivation:false as const};
}

export async function withdrawSkillRuntimePackage(client:PoolClient,input:unknown){
 const spec=z.object({requestId:z.uuid(),revision:z.string().regex(/^[1-9][0-9]*$/),reason:z.string().trim().min(1).max(1000)}).strict().parse(input);
 const check=await operatorTransaction(client);
 const result=(await client.query<{request_id:string}>('select public.withdraw_skill_runtime_package($1,$2,$3)::text request_id',[spec.requestId,spec.revision,spec.reason])).rows[0];
 if(result?.request_id!==spec.requestId)throw new Error('Runtime withdrawal readback changed');
 await check();return {requestId:spec.requestId,revision:spec.revision,withdrawn:true as const,automaticActivation:false as const};
}
