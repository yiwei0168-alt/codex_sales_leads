import type {PoolClient} from 'pg';
import {expect,it,vi} from 'vitest';
import {admitSkillCatalogWrite} from './skill-catalog-admission';
import {readLockedSkillAcceptanceEvidence} from './skill-acceptance-store';
it('keeps writes compatible with schemas without catalog-lock readers',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{configured:false}]});
 await admitSkillCatalogWrite({query} as unknown as PoolClient);
 expect(query).toHaveBeenCalledTimes(1);
});
it.each([undefined,'00000000-0000-4000-8000-000000000001'])('admits a write before callers lock method rows (%s)',async id=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{configured:true}]}).mockResolvedValue({rows:[]});
 await admitSkillCatalogWrite({query} as unknown as PoolClient,id);
 expect(query.mock.calls[1]).toEqual(['select lock_skill_method_catalog_writes($1::uuid)',[id??null]]);
});
it('fails closed on missing metadata or a configured admission failure',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 await expect(admitSkillCatalogWrite({query} as unknown as PoolClient)).rejects.toThrow('metadata unavailable');
 query.mockResolvedValueOnce({rows:[{configured:true}]}).mockRejectedValueOnce(new Error('Admission denied'));
 await expect(admitSkillCatalogWrite({query} as unknown as PoolClient)).rejects.toThrow('Admission denied');
});
it('requires the catalog reader before loading any locked acceptance bundle',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce(new Error('Catalog migration missing'));
 const id='00000000-0000-4000-8000-000000000001';
 await expect(readLockedSkillAcceptanceEvidence({query} as unknown as PoolClient,{userId:id},id)).rejects.toThrow('Catalog migration missing');
 expect(query.mock.calls.map(row=>row[0])).toEqual(['select lock_skill_knowledge_sources()','select lock_skill_method_catalog_sources()']);
});
