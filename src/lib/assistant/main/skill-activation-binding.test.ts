import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {digest} from './contracts';
import {skillActivationCurrent,skillActivationFingerprint,skillEnabledExpression} from './skill-activation-binding';
const m=vi.hoisted(()=>({sources:vi.fn(async()=>{}),ledger:vi.fn(async()=>({acceptanceLedgerHash:'4'.repeat(64)})),runtime:vi.fn(async()=>'5'.repeat(64))}));
vi.mock('./skill-runtime-identity',()=>({skillSourceRuntimeHash:m.runtime}));
vi.mock('@/lib/rag/db',()=>({withBoundTenantTransaction:async(_client:unknown,_user:string,work:()=>Promise<unknown>)=>work()}));
vi.mock('./skill-activation-sources',()=>({assertSkillActivationSourcesCurrent:m.sources}));
vi.mock('./skill-acceptance-ledger',()=>({captureSkillAcceptanceLedger:m.ledger}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const binding={protocol:'skill-activation-binding-v1',ownerId:id(1),skillId:id(2),version:1,bundleId:id(3),freezeId:id(4),
 artifactHash:digest('artifact'),reviewHash:digest('reviews'),reviewVersions:[],registryHash:digest('registry'),runtimePackageRevisions:['1','2','3'],acceptanceLedgerHash:'4'.repeat(64),sourceFenceId:id(7),runtimeHash:'5'.repeat(64),
 validBefore:'2026-10-20T18:00:00.000Z',activationProofHash:digest('proof'),callId:id(5),sources:[{runId:id(6),sourceHash:digest('source'),chainHash:digest('chain'),initialSourceHash:digest('initial'),attachmentHash:digest('attachments'),knowledgeHash:digest('knowledge'),pinnedMethodsHash:digest('pins'),validBefore:null}]};
it('keeps manual/old-schema Skills compatible without a qualification query',async()=>{
 const query=vi.fn(),client={query} as unknown as PoolClient;
 expect(await skillActivationCurrent(client,id(1),id(2),1,null)).toBe(true);expect(query).not.toHaveBeenCalled();
});
it('checks the actual database for a bound Skill and denies withdrawn eligibility',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:false,admitted:true,isolation:'read committed'}]}),client={query} as unknown as PoolClient;
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
 expect(query).toHaveBeenCalledWith(expect.stringContaining('skill_activation_is_current'),[id(1),id(2),1]);
 query.mockResolvedValue({rows:[{current:true,admitted:true,isolation:'read committed'}]});expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(true);
});
it('refuses malformed bindings and version substitution; missing guard does not fall back',async()=>{
 const query=vi.fn().mockRejectedValue(new Error('Missing database guard')),client={query} as unknown as PoolClient;
 expect(await skillActivationCurrent(client,id(1),id(2),2,binding)).toBe(false);
 expect(await skillActivationCurrent(client,id(1),id(2),1,{})).toBe(false);expect(query).not.toHaveBeenCalled();
 await expect(skillActivationCurrent(client,id(1),id(2),1,binding)).rejects.toThrow('Missing database guard');
});
it('matches opaque read receipts to database bindings and detects renewal/clearing',()=>{
 const hash=skillActivationFingerprint({activation_binding:binding});
 expect(skillActivationFingerprint({activation_binding_hash:hash!})).toBe(hash);
 expect(skillActivationFingerprint({activation_binding:{...binding,callId:id(9)}})).not.toBe(hash);
 expect(skillActivationFingerprint({})).not.toBe(hash);
});
it('denies foreign owners and old automatic bindings without a runtime fingerprint',async()=>{
 const query=vi.fn(),client={query} as unknown as PoolClient;
 expect(await skillActivationCurrent(client,id(9),id(2),1,binding)).toBe(false);
 const {runtimeHash,...old}=binding;expect(runtimeHash).toHaveLength(64);
 expect(await skillActivationCurrent(client,id(1),id(2),1,old)).toBe(false);expect(query).not.toHaveBeenCalled();
});
it('denies changed or unavailable runtimes before source reconstruction',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:true,admitted:true,isolation:'read committed'}]}),client={query} as unknown as PoolClient;
 m.sources.mockClear();m.runtime.mockResolvedValueOnce(digest('new runtime'));
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);expect(m.sources).not.toHaveBeenCalled();
 m.runtime.mockRejectedValueOnce(new Error('Source inventory unavailable'));
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
});
it('rejects a runtime change during business-source revalidation',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:true,admitted:true,isolation:'read committed'}]}),client={query} as unknown as PoolClient;
 m.runtime.mockResolvedValueOnce(binding.runtimeHash).mockResolvedValueOnce(digest('late runtime'));
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
 expect(query).toHaveBeenCalledTimes(4);
});
it('denies revoked business sources even while SQL qualification remains current',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:true,admitted:true,isolation:'read committed'}]}),client={query} as unknown as PoolClient;
 m.sources.mockRejectedValueOnce(new Error('Source withdrawn'));
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
});
it('rejects recursive qualification dependencies without unbounded revalidation',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:true,admitted:true,isolation:'read committed'}]}),client={query} as unknown as PoolClient;
 m.sources.mockImplementationOnce(async()=>{
  if(!await skillActivationCurrent(client,id(1),id(2),1,binding))throw new Error('Cyclic method source');
 });
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
});
it('denies evaluation/capture changes both before and during business-source reconstruction',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:true,admitted:true,isolation:'read committed'}]}),client={query} as unknown as PoolClient;
 m.ledger.mockResolvedValueOnce({acceptanceLedgerHash:digest('changed ledger')});
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
 m.ledger.mockResolvedValueOnce({acceptanceLedgerHash:binding.acceptanceLedgerHash}).mockResolvedValueOnce({acceptanceLedgerHash:digest('late ledger')});
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
});
it('lists bound Skills as unavailable when their database guard is absent',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{available:false}]});
 expect(await skillEnabledExpression({query})).toContain("(to_jsonb(s)->'activation_binding') is null");
 query.mockResolvedValue({rows:[{available:true}]});expect(await skillEnabledExpression({query})).toContain('skill_activation_is_current');
});
it.each([0,1])('denies a busy admission gate %i before reading qualification or sources',async(blocked)=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{isolation:'read committed'}]});
 if(blocked===1)query.mockResolvedValueOnce({rows:[{admitted:true,isolation:'read committed'}]});
 query.mockResolvedValueOnce({rows:[{admitted:false}]});
 m.sources.mockClear();m.ledger.mockClear();m.runtime.mockClear();
 expect(await skillActivationCurrent({query} as unknown as PoolClient,id(1),id(2),1,binding)).toBe(false);
 expect(query).toHaveBeenCalledTimes(blocked+2);
 expect(query.mock.calls.slice(1).every(([sql])=>sql.includes('pg_try_advisory_xact_lock_shared'))).toBe(true);
 expect(m.sources).not.toHaveBeenCalled();expect(m.ledger).not.toHaveBeenCalled();expect(m.runtime).not.toHaveBeenCalled();
});
it.each(['repeatable read','serializable',undefined])('denies stale or unknown isolation %s',async(isolation)=>{
 const query=vi.fn().mockResolvedValue({rows:[{isolation}]});
 expect(await skillActivationCurrent({query} as unknown as PoolClient,id(1),id(2),1,binding)).toBe(false);
 expect(query).toHaveBeenCalledTimes(1);
});
