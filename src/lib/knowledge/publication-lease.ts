import type {PoolClient} from 'pg';

/** Optional worker ownership, checked at the database wall clock after work.
 * A successful check does not extend the stored lease. */
export async function assertCurrentUploadLease(client:PoolClient,userId:string,jobId:string,leaseToken?:string){
  if(!leaseToken)return;
  const lease=await client.query("select id from knowledge_upload_job where id=$1 and user_id=$2 and lease_token=$3 and lease_until>clock_timestamp()",[jobId,userId,leaseToken]);
  if(!lease.rows[0])throw new Error('Upload lease expired after publication preparation');
}
