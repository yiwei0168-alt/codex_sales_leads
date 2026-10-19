import type {PoolClient} from 'pg';

/** Caller owns this tenant transaction. Take admission before memory-key,
 * target or row locks. Match migration 148's statement gate, including admins.
 * Direct advisory keys also preserve the order on historical schemas. */
export async function lockMemorySourceAdmission(client:PoolClient,userId:string,globalScope=false){
  await client.query(`select case when $1::boolean or app_current_user_role()='admin'
    then pg_advisory_xact_lock(hashtextextended('skill-memory-global',0))
    else pg_advisory_xact_lock_shared(hashtextextended('skill-memory-global',0)) end`,[globalScope]);
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`skill-memory-owner:${userId}`]);
}
