import type {PoolClient} from 'pg';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {skillRunnerTrustRegistrySchema} from './skill-runner-trust-registry-schema';
import {z} from 'zod';

/** Read-side building block. The shared admission survives this call until the
 * caller commits/rolls back. It does not authenticate runtime/provider identity
 * and is not an activation grant. Configured database readers reuse this path. */
export async function readLockedSkillRunnerTrustRegistry(client:PoolClient,userId:string){
 return withBoundTenantTransaction(client,userId,()=>readRegistryUnderAdmission(client));
}

/** Dedicated collector transaction only. Do not bind it as an application
 * transaction or open another connection while retaining collector locks. */
export async function readLockedCollectorSkillRunnerTrustRegistry(client:PoolClient,userId:string){
 z.uuid().parse(userId);
 const state=async()=>(await client.query<{id:string;actor:string;role:string;unsafe:boolean}>(`select pg_current_xact_id()::text id,
  current_setting('app.current_user_id',true) actor,current_user as role,(r.rolsuper or r.rolbypassrls) unsafe
  from pg_roles r where r.rolname=current_user`)).rows[0];
 const before=await state();
 if(!before||before.actor!==userId||before.role!=='network_copilot_skill_collector'||before.unsafe)
  throw new Error('Collector trust registry account or role invalid');
 const check=async()=>{const after=await state();if(!after||after.id!==before.id||after.actor!==before.actor||after.role!==before.role||after.unsafe)
  throw new Error('Collector trust registry transaction changed');};
 await check();
 const result=await readRegistryUnderAdmission(client);await check();return result;
}

async function readRegistryUnderAdmission(client:PoolClient){
  const isolation=(await client.query<{isolation:string}>("select current_setting('transaction_isolation') as isolation")).rows[0]?.isolation;
  // A repeatable-read snapshot taken before waiting could see a revoked version.
  if(isolation!=='read committed')throw new Error('Trust registry requires read committed transaction');
  // Some standalone consumers already hold product source locks. Never queue
  // behind a publisher: a queued exclusive waiter plus another reader holding
  // admission and waiting on those source locks could form a lock-order cycle.
  const admitted=(await client.query<{admitted:boolean}>("select pg_try_advisory_xact_lock_shared(hashtextextended('skill-runner-trust-registry-v1',0)) as admitted")).rows[0]?.admitted;
  if(!admitted)throw new Error('Trust registry publication in progress; retry the complete transaction');
  // Separate statement: capture the committed pointer AFTER admission.
  const row=(await client.query<{revision:string;registry:unknown;registry_hash:string}>(`select v.revision::text,v.registry,v.registry_hash
   from public.skill_runner_trust_registry_current c join public.skill_runner_trust_registry_version v on v.revision=c.revision where c.singleton`)).rows[0];
  if(!row)throw new Error('Database runner trust registry is not enrolled');
  const registry=skillRunnerTrustRegistrySchema.parse(row.registry);
  if(digest(registry)!==row.registry_hash)throw new Error('Database runner trust registry digest changed');
  return {registry,revision:row.revision,registryHash:row.registry_hash,trustRegistryLocked:true as const,automaticActivation:false as const};
}
