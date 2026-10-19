import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {Client} from 'pg';
import {digest} from '../../src/lib/assistant/main/contracts';
import {skillRunnerTrustRegistrySchema} from '../../src/lib/assistant/main/skill-runner-trust-registry-schema';

/** Disposable cluster only: retain active history and disabled current enrollment
 * so a restore cannot silently reset the pointer or revive a revoked test key. */
export async function prepareTrustRegistryRestoreFixture(sourceUrl:string,containerId:string){
 assert(/^[a-f0-9]{64}$/.test(containerId));const url=new URL(sourceUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/network_copilot_local');
 const source=new Client({connectionString:sourceUrl});await source.connect();
 const read=async(client:Client)=>({versions:(await client.query('select to_jsonb(v) value from public.skill_runner_trust_registry_version v order by revision')).rows,
  pointer:(await client.query('select to_jsonb(c) value from public.skill_runner_trust_registry_current c')).rows,
  sequence:(await client.query('select last_value::text,is_called from public.skill_runner_trust_registry_version_revision_seq')).rows});
 let expected:Awaited<ReturnType<typeof read>>;
 try{
  assert.equal((await source.query('select count(*)::int n from public.skill_runner_trust_registry_version')).rows[0].n,0,'Fresh trust registry required');
  const pair=generateKeyPairSync('ed25519');
  const registry=skillRunnerTrustRegistrySchema.parse({protocol:'skill-runner-trust-registry-v1',keys:[{keyId:'synthetic-restore-key',collectorId:'synthetic-restore',deploymentHash:'1'.repeat(64),
   publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),enabled:true,notBefore:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z'}]});
  await source.query('select public.publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
  registry.keys[0].enabled=false;await source.query('select public.publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]);
  expected=await read(source);assert.equal(expected.versions.length,2);
 }finally{await source.end();}
 return async(adminUrl:string,appUrl:string)=>{
  const admin=new Client({connectionString:adminUrl});await admin.connect();
  try{assert.deepEqual(await read(admin),expected,'Restored registry history, pointer or identity sequence changed');
   assert((await admin.query("select to_regprocedure('public.publish_skill_runner_trust_registry(jsonb,text)') is not null present")).rows[0].present);
  }finally{await admin.end();}
  const app=new Client({connectionString:appUrl});await app.connect();
  try{
   await app.query('begin');await app.query('set local role network_copilot_app');
   const row=(await app.query('select v.registry,v.registry_hash from public.skill_runner_trust_registry_current c join public.skill_runner_trust_registry_version v on v.revision=c.revision')).rows[0];
   const registry=skillRunnerTrustRegistrySchema.parse(row.registry);assert.equal(digest(registry),row.registry_hash);assert.equal(registry.keys[0].enabled,false);
   await assert.rejects(app.query('select public.publish_skill_runner_trust_registry($1,$2)',[registry,digest(registry)]),/permission denied/);await app.query('rollback');
  }finally{await app.end();}
  return {registryVersions:2,currentDisabledEnrollmentPreserved:true,historyPointerAndSequenceMatched:true,restrictedApplicationReadAndPublishDenialVerified:true};
 };
}
