import type {PoolClient} from 'pg';

/** Acquire admission before SELECT FOR UPDATE or FK/row locks. Old schemas have
 * no catalog-lock reader; they keep existing writes while locked acceptance
 * requires migration 152 and fails closed if its read function is absent. */
export async function admitSkillCatalogWrite(client:PoolClient,skillId?:string){
 const configured=(await client.query<{configured:boolean}>(
  "select to_regprocedure('public.lock_skill_method_catalog_writes(uuid)') is not null as configured")).rows[0]?.configured;
 if(typeof configured!=='boolean')throw new Error('Skill catalog admission metadata unavailable');
 if(configured)await client.query('select lock_skill_method_catalog_writes($1::uuid)',[skillId??null]);
}
