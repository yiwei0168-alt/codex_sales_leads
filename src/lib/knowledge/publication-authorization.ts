import type {PoolClient} from 'pg';

/** Final point-in-time authorization check on the publisher's existing client.
 * This does not grant a lease against later account administration changes. */
export async function assertCurrentKnowledgePublisher(client:PoolClient,userId:string,visibility:string){
  if(!['private','shared'].includes(visibility))throw new Error('Publication visibility unavailable');
  const actor=(await client.query<{role:string}>("select role from app_user where id=$1 and status='active'",[userId])).rows[0];
  if(!actor||!['admin','member'].includes(actor.role)||visibility==='shared'&&actor.role!=='admin')
    throw new Error('Publication account is no longer authorized');
}
