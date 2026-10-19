import {generateKeyPairSync,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {beforeEach,expect,it,vi} from 'vitest';
import {digest} from './contracts';
import {publishSkillRuntimePackage,withdrawSkillRuntimePackage} from '../../../../scripts/lib/skill-runtime-package-publication';
const m=vi.hoisted(()=>({inspect:vi.fn(),query:vi.fn()}));
vi.mock('../../../../scripts/lib/skill-runtime-package-inspection',()=>({inspectSkillRuntimePackage:m.inspect}));
const inspection={role:'main-agent',imageId:`sha256:${digest('image')}`,sourceCommit:'a'.repeat(40),deploymentHash:digest('package'),runtimeHash:digest('runtime'),
 nodeSha256:digest('node'),node:'24.21.0',platform:'linux',arch:'x64',sourceInputs:966,files:34516};
const spec={imageId:inspection.imageId,keyId:'signing-key',purpose:'task-model-transport',validUntil:'2026-10-20T01:00:00.000Z',requestId:randomUUID(),expectedRevision:'none'};
const key={keyId:spec.keyId,collectorId:'main-runtime',deploymentHash:inspection.deploymentHash,enabled:true,notBefore:'2026-10-20T00:00:00.000Z',expiresAt:'2026-10-20T02:00:00.000Z',purposes:['task-model-transport','model-transport','runner-declaration'],
 publicKeyPem:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString()};
const registry={protocol:'skill-runner-trust-registry-v1',keys:[key]};
let activeRegistry:typeof registry,valid:boolean,admitted:boolean,application:boolean,prior:boolean,transactionId:string,corrupt:boolean;
let document:unknown;
const client={query:m.query} as unknown as PoolClient;
beforeEach(()=>{
 vi.resetAllMocks();activeRegistry=structuredClone(registry);valid=true;admitted=true;application=false;prior=false;transactionId='1';corrupt=false;document=undefined;
 m.inspect.mockReturnValue(inspection);
 m.query.mockImplementation(async(sql:string,params?:unknown[])=>{
  if(sql.includes('pg_current_xact_id()'))return {rows:[{id:transactionId,isolation:'read committed',role:'operations',application}]};
  if(sql.includes('from pg_roles'))return {rows:[{superuser:false}]};
  if(sql.includes('pg_try_advisory'))return {rows:[{admitted}]};
  if(sql.includes('join public.skill_runner_trust_registry_version'))return {rows:[{registry:activeRegistry,registry_hash:digest(activeRegistry)}]};
  if(sql.includes('where request_id='))return {rows:prior?[{revision:'1',registration_hash:'unused'}]:[]};
  if(sql.startsWith('select $1::timestamptz'))return {rows:[{valid}]};
  if(sql.includes('public.register_skill_runtime_package')){document=params![0];return {rows:[{revision:'1'}]};}
  if(sql.includes('select registration,registration_hash'))return {rows:[{registration:document,registration_hash:corrupt?digest('corrupt'):digest(document)}]};
  if(sql.includes('public.withdraw_skill_runtime_package'))return {rows:[{request_id:params![0]}]};
  throw new Error('Unexpected publication query');
 });
});
it('derives the document from actual inspection and current registry instead of accepting caller measurements',async()=>{
 const out=await publishSkillRuntimePackage(client,spec);
 expect(m.inspect).toHaveBeenCalledExactlyOnceWith(spec.imageId,'main-agent');
 expect(document).toMatchObject({inspection,binding:{keyId:key.keyId,collectorId:key.collectorId,deploymentHash:key.deploymentHash,purpose:spec.purpose},validUntil:spec.validUntil});
 expect(out).toMatchObject({revision:'1',idempotent:false,productionQualified:false,automaticActivation:false});
 expect(JSON.stringify(out)).not.toContain('BEGIN PUBLIC KEY');
 await expect(publishSkillRuntimePackage(client,{...spec,inspection})).rejects.toThrow();
});
it.each(['model-transport','runner-declaration'])('inspects a collector package for %s',async purpose=>{
 const measured={...inspection,role:'skill-collector'};m.inspect.mockReturnValue(measured);
 await publishSkillRuntimePackage(client,{...spec,purpose});expect(m.inspect).toHaveBeenCalledWith(spec.imageId,'skill-collector');
});
it.each(['disabled','deployment','purpose','time','busy'] as const)('rejects %s without publishing a package',async kind=>{
 if(kind==='disabled')activeRegistry.keys[0].enabled=false;
 if(kind==='deployment')activeRegistry.keys[0].deploymentHash=digest('other-package');
 if(kind==='purpose')activeRegistry.keys[0].purposes=['runner-declaration'];
 if(kind==='time')valid=false;if(kind==='busy')admitted=false;
 await expect(publishSkillRuntimePackage(client,spec)).rejects.toThrow();
 expect(m.query.mock.calls.some(([sql])=>sql.includes('public.register_skill_runtime_package'))).toBe(false);
});
it('rejects business roles before executing any image',async()=>{
 application=true;await expect(publishSkillRuntimePackage(client,spec)).rejects.toThrow('operator read-committed');expect(m.inspect).not.toHaveBeenCalled();
});
it('rejects a transaction replaced during image inspection',async()=>{
 m.inspect.mockImplementation(()=>{transactionId='2';return inspection;});await expect(publishSkillRuntimePackage(client,spec)).rejects.toThrow('transaction changed');
});
it('rejects corrupted native publication readback',async()=>{
 corrupt=true;await expect(publishSkillRuntimePackage(client,spec)).rejects.toThrow('readback changed');
});
it('allows native exact-request reconciliation after expiry without a new validity grant',async()=>{
 prior=true;valid=false;expect(await publishSkillRuntimePackage(client,spec)).toMatchObject({idempotent:true,productionQualified:false});
 expect(m.query.mock.calls.some(([sql])=>sql.startsWith('select $1::timestamptz'))).toBe(false);
});
it('requires an explicit valid immutable image and expected stream revision',async()=>{
 await expect(publishSkillRuntimePackage(client,{...spec,imageId:'mutable:latest'})).rejects.toThrow();
 await expect(publishSkillRuntimePackage(client,{...spec,expectedRevision:'-1'})).rejects.toThrow();expect(m.inspect).not.toHaveBeenCalled();
});
it('withdraws only the explicit immutable revision and request ID without reenabling anything',async()=>{
 const requestId=randomUUID();expect(await withdrawSkillRuntimePackage(client,{requestId,revision:'1',reason:'operator reviewed withdrawal'}))
  .toEqual({requestId,revision:'1',withdrawn:true,automaticActivation:false});
 application=true;await expect(withdrawSkillRuntimePackage(client,{requestId,revision:'1',reason:'denied'})).rejects.toThrow('operator read-committed');
});
