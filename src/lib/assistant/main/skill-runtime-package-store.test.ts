import {generateKeyPairSync} from 'node:crypto';
import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {readLockedSkillRuntimePackages} from './skill-runtime-package-store';
import {skillRuntimePackageRegistrationSchema,skillRuntimePublicKeyHash} from './skill-runtime-package-schema';
const m=vi.hoisted(()=>({registry:vi.fn(),mode:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./skill-runner-attestation',()=>({configuredSkillRunnerTrustRegistryMode:m.mode}));
vi.mock('./skill-runner-trust-registry-store',()=>({readLockedSkillRunnerTrustRegistry:m.registry}));
const publicKeyPem=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
const runtimeHash=digest('runtime'),registryHash=digest('registry');
const binding={keyId:'task-key',collectorId:'main-agent',deploymentHash:digest('package'),purpose:'task-model-transport' as const};
const window={...binding,requiredFrom:'2026-10-20T00:01:00.000Z',requiredThrough:'2026-10-20T00:02:00.000Z'};
const registration={protocol:'skill-runtime-package-registration-v1' as const,binding:{...binding,publicKeyHash:skillRuntimePublicKeyHash(publicKeyPem)},
 inspection:{role:'main-agent' as const,imageId:`sha256:${digest('image')}`,sourceCommit:'a'.repeat(40),deploymentHash:binding.deploymentHash,
  runtimeHash,nodeSha256:digest('node'),node:'24.21.0',platform:'linux' as const,arch:'x64' as const,sourceInputs:966,files:34516},validUntil:'2026-10-20T00:30:00.000Z'};
const trust={registryHash,registry:{keys:[{...binding,publicKeyPem,enabled:true,purposes:[binding.purpose],notBefore:'2026-10-20T00:00:00.000Z',expiresAt:'2026-10-20T01:00:00.000Z'}]}};
let supported:boolean,admitted:boolean,valid:boolean,saved:Record<string,unknown>|undefined;
const client={query:m.query} as unknown as PoolClient;
const read=()=>readLockedSkillRuntimePackages(client,'owner',{registryHash,runtimeHash,windows:[window]});
beforeEach(()=>{
 vi.resetAllMocks();supported=true;admitted=true;valid=true;
 saved={revision:'3',key_id:binding.keyId,purpose:binding.purpose,registration,registration_hash:digest(registration),withdrawn:false};
 m.mode.mockReturnValue('database');m.registry.mockResolvedValue(trust);
 m.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('to_regclass'))return {rows:[{supported}]};
  if(sql.includes('pg_try_advisory'))return {rows:[{admitted}]};
  if(sql.includes('order by r.revision desc'))return {rows:saved?[saved]:[]};
  if(sql.includes('registered_at>='))return {rows:[{valid}]};
  throw new Error('Unexpected package query');
 });
});
it('retains shared admission before latest registration reads and binds current key, exact windows and source',async()=>{
 const out=await read();expect(out).toMatchObject({runtimePackagesRequired:true,runtimePackagesRegistered:true,runtimePackageCount:1,runtimePackageRevisions:['3'],runtimePackageValidBefore:registration.validUntil});
 expect(out).not.toHaveProperty('collectorProvenanceVerified');expect(out).not.toHaveProperty('automaticActivation');
 expect(out).toMatchObject({runtimePackageBytesPairRevalidated:false});
 const calls=m.query.mock.calls;expect(calls.findIndex(([sql])=>sql.includes('pg_try_advisory'))).toBeLessThan(calls.findIndex(([sql])=>sql.includes('order by')));
 const [sql,params]=calls.find(([sql])=>sql.includes('registered_at>='))!;
 expect(sql).toContain('registered_at<=$4::timestamptz');expect(sql).toContain('clock_timestamp()<least');
 expect(params).toEqual(['3',trust.registry.keys[0].notBefore,trust.registry.keys[0].expiresAt,window.requiredFrom,window.requiredThrough,registration.validUntil]);
 expect(calls.some(([sql])=>/\b(commit|rollback|unlock)\b/i.test(sql))).toBe(false);
});
it.each(['file','schema','busy','missing','withdrawn','time'] as const)('keeps %s evidence unqualified without fallback',async kind=>{
 if(kind==='file')m.mode.mockReturnValue('file');if(kind==='schema')supported=false;if(kind==='busy')admitted=false;
 if(kind==='missing')saved=undefined;if(kind==='withdrawn')saved!.withdrawn=true;if(kind==='time')valid=false;
 expect(await read()).toMatchObject({runtimePackagesRegistered:false});
 if(['file','schema','busy'].includes(kind))expect(m.query.mock.calls.some(([sql])=>sql.includes('order by'))).toBe(false);
 if(kind==='withdrawn')expect(m.query.mock.calls.filter(([sql])=>sql.includes('order by'))).toHaveLength(1);
});
it.each(['public-key','collector','source'] as const)('rejects a well-formed registration with mismatched %s',async kind=>{
 const doc=structuredClone(registration);
 if(kind==='public-key')doc.binding.publicKeyHash=digest('other-key');
 if(kind==='collector')doc.binding.collectorId='other-collector';
 if(kind==='source')doc.inspection.runtimeHash=digest('other-source');
 saved={...saved,registration:doc,registration_hash:digest(doc)};
 expect(await read()).toMatchObject({runtimePackagesRegistered:false});
});
it('throws on corrupted immutable registration rather than trusting its envelope',async()=>{
 saved!.registration_hash=digest('tampered');await expect(read()).rejects.toThrow('digest changed');
});
it('throws on current trust changes before any package can qualify',async()=>{
 m.registry.mockResolvedValue({...trust,registryHash:digest('changed')});await expect(read()).rejects.toThrow('trust changed');
 m.registry.mockResolvedValue({...trust,registry:{keys:[{...trust.registry.keys[0],enabled:false}]}});await expect(read()).rejects.toThrow('enrollment changed');
});
it('binds readiness hash to the full usage window even when identity stays unchanged',async()=>{
 const first=await read();const second=await readLockedSkillRuntimePackages(client,'owner',{registryHash,runtimeHash,windows:[{...window,requiredThrough:'2026-10-20T00:03:00.000Z'}]});
 if(!first.runtimePackagesRegistered||!second.runtimePackagesRegistered)throw new Error('Expected registered packages');
 expect(second.runtimePackageRegistrationHash).not.toBe(first.runtimePackageRegistrationHash);
});
it('rejects role substitution and incomplete package claims',()=>{
 expect(()=>skillRuntimePackageRegistrationSchema.parse({...registration,inspection:{...registration.inspection,role:'skill-collector'}})).toThrow('role');
 expect(()=>skillRuntimePackageRegistrationSchema.parse({...registration,inspection:{...registration.inspection,deploymentHash:digest('other')}})).toThrow('deployment');
 expect(()=>skillRuntimePackageRegistrationSchema.parse({...registration,productionQualified:true})).toThrow();
});
it('compares the entire locked three-purpose registration set instead of treating individual registration as equivalence',async()=>{
 const purposes=['task-model-transport','model-transport','runner-declaration'] as const;
 const docs=purposes.map(purpose=>{
  const deployed=digest(purpose),role=purpose==='task-model-transport'?'main-agent' as const:'skill-collector' as const;
  return {...registration,binding:{...registration.binding,keyId:purpose,purpose,deploymentHash:deployed},inspection:{...registration.inspection,role,deploymentHash:deployed,
   dependencyFiles:32000,dependencyManifestHash:digest('dependencies')}};
 });
 m.registry.mockResolvedValue({...trust,registry:{keys:docs.map(row=>({...trust.registry.keys[0],...row.binding,purposes:[row.binding.purpose]}))}});
 m.query.mockImplementation(async(sql:string,params:unknown[])=>{
  if(sql.includes('to_regclass'))return {rows:[{supported:true}]};
  if(sql.includes('pg_try_advisory'))return {rows:[{admitted:true}]};
  if(sql.includes('registered_at>='))return {rows:[{valid:true}]};
  const doc=docs.find(row=>row.binding.keyId===params[0]);
  if(!doc)throw new Error('Unexpected signing key');
  return {rows:[{revision:String(docs.indexOf(doc)+1),key_id:doc.binding.keyId,purpose:doc.binding.purpose,registration:doc,registration_hash:digest(doc),withdrawn:false}]};
 });
 const readAll=()=>readLockedSkillRuntimePackages(client,'owner',{registryHash,runtimeHash,windows:docs.map(doc=>({...window,keyId:doc.binding.keyId,purpose:doc.binding.purpose,deploymentHash:doc.binding.deploymentHash}))});
 expect(await readAll()).toMatchObject({runtimePackagesRegistered:true,runtimePackageBytesPairRevalidated:true,runtimePackageCount:3});
 docs[1].inspection.dependencyManifestHash=digest('different dependency bytes');
 expect(await readAll()).toMatchObject({runtimePackagesRegistered:true,runtimePackageBytesPairRevalidated:false,
  runtimePackageBytesPairBlockers:['runtime-package-byte-identities-differ']});
});
