import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {digest} from './contracts';
import {skillActivationCurrent,skillActivationFingerprint,skillEnabledExpression} from './skill-activation-binding';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const binding={protocol:'skill-activation-binding-v1',ownerId:id(1),skillId:id(2),version:1,bundleId:id(3),freezeId:id(4),
 artifactHash:digest('artifact'),reviewHash:digest('reviews'),reviewVersions:[],registryHash:digest('registry'),runtimePackageRevisions:['1','2','3'],
 validBefore:'2026-10-20T18:00:00.000Z',activationProofHash:digest('proof'),callId:id(5)};
it('keeps manual/old-schema Skills compatible without a qualification query',async()=>{
 const query=vi.fn(),client={query} as unknown as PoolClient;
 expect(await skillActivationCurrent(client,id(1),id(2),1,null)).toBe(true);expect(query).not.toHaveBeenCalled();
});
it('checks the actual database for a bound Skill and denies withdrawn eligibility',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{current:false}]}),client={query} as unknown as PoolClient;
 expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(false);
 expect(query).toHaveBeenCalledWith(expect.stringContaining('skill_activation_is_current'),[id(1),id(2),1]);
 query.mockResolvedValue({rows:[{current:true}]});expect(await skillActivationCurrent(client,id(1),id(2),1,binding)).toBe(true);
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
it('lists bound Skills as unavailable when their database guard is absent',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{available:false}]});
 expect(await skillEnabledExpression({query})).toContain("(to_jsonb(s)->'activation_binding') is null");
 query.mockResolvedValue({rows:[{available:true}]});expect(await skillEnabledExpression({query})).toContain('skill_activation_is_current');
});
