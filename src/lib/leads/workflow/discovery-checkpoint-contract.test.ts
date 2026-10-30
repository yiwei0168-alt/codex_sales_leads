import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
vi.mock('@/lib/rag/db',()=>({tenantQuery:vi.fn()}));
import {discoveryRoundContract} from './discovery-checkpoint';
it('preserves the original no-local-gap contract and isolates the newly enabled local route',()=>{
 const prior=createHash('sha256').update(JSON.stringify({dependency:'original',playbook:{},round:1,targetPool:12})).digest('hex');
 expect(discoveryRoundContract('original',{},1,12)).toBe(prior);
 expect(discoveryRoundContract('original',{},1,12,false)).toBe(prior);
 expect(discoveryRoundContract('original',{},1,12,true)).not.toBe(prior);
});
