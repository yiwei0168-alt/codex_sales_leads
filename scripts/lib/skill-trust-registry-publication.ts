import {createPublicKey} from 'node:crypto';
import type {PoolClient} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {skillRunnerTrustRegistrySchema} from '../../src/lib/assistant/main/skill-runner-trust-registry-schema';

/** Operator-only helper inside a caller-owned transaction. Never publish via an
 * application/collector endpoint. Expected revision prevents lost updates. */
export async function publishSkillRunnerTrustRegistry(client:PoolClient,input:unknown,expectedRevision:string){
 if(!/^(?:none|[1-9][0-9]*)$/.test(expectedRevision))throw new Error('Expected trust revision must be none or a positive integer');
 const registry=skillRunnerTrustRegistrySchema.parse(input);
 for(const key of registry.keys){
  if(createPublicKey(key.publicKeyPem).asymmetricKeyType!=='ed25519')throw new Error('Trust registry requires Ed25519 public keys');
  if(Date.parse(key.notBefore)>=Date.parse(key.expiresAt))throw new Error('Trust registry key time window invalid');
 }
 const before=(await client.query<{id:string;isolation:string}>("select pg_current_xact_id()::text id,current_setting('transaction_isolation') isolation")).rows[0];
 const check=async()=>{
  const after=(await client.query<{id:string}>('select pg_current_xact_id()::text id')).rows[0];
  if(!before||after?.id!==before.id)throw new Error('Trust publication requires a stable caller transaction');
 };
 if(before?.isolation!=='read committed')throw new Error('Trust publication requires read committed');
 await check();
 await client.query("select pg_advisory_xact_lock(hashtextextended('skill-runner-trust-registry-v1',0))");
 await check();
 const current=(await client.query<{revision:string}>('select revision::text from public.skill_runner_trust_registry_current where singleton')).rows[0]?.revision??'none';
 if(current!==expectedRevision)throw new Error('Trust registry revision changed; reload and review before publishing');
 const registryHash=digest(registry);
 const published=(await client.query<{revision:string}>('select public.publish_skill_runner_trust_registry($1,$2)::text revision',[registry,registryHash])).rows[0]?.revision;
 const saved=(await client.query<{revision:string;registry:unknown;registry_hash:string}>(`select v.revision::text,v.registry,v.registry_hash
  from public.skill_runner_trust_registry_current c join public.skill_runner_trust_registry_version v on v.revision=c.revision where c.singleton`)).rows[0];
 if(!published||saved?.revision!==published||saved.registry_hash!==registryHash||digest(skillRunnerTrustRegistrySchema.parse(saved.registry))!==registryHash)
  throw new Error('Published trust registry readback changed');
 await check();
 return {revision:published,previousRevision:current,registryHash,keyCount:registry.keys.length,automaticActivation:false as const};
}
