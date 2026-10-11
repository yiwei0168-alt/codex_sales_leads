import {randomUUID} from 'node:crypto';
import {query,tenantQuery,tenantTransaction} from '@/lib/rag/db';
export async function claimVisualReviewJob(onlyJobId?:string){
  const accounts=await query<{id:string}>("select id from app_user where status='active' order by id");
  for(const account of accounts){
    const result=await tenantTransaction(account.id,async client=>{
      const found=await client.query<{id:string}>(`select id from knowledge_upload_job where user_id=$1 and ($2::uuid is null or id=$2)
        and status='extracted' and error_code='extraction-review-required' and lower(storage_key) like '%.pptx'
        and metrics->>'visualReviewKey' is null and visual_attempts<3
        and (visual_lease_until is null or visual_lease_until<now()) and (visual_retry_at is null or visual_retry_at<=now())
        order by updated_at for update skip locked limit 1`,[account.id,onlyJobId??null]);
      if(!found.rows[0])return null;
      const leaseToken=randomUUID();
      await client.query(`update knowledge_upload_job set visual_lease_token=$2,visual_lease_until=now()+interval '25 minutes',
        visual_attempts=visual_attempts+1,visual_error_code=null,visual_retry_at=null where id=$1`,[found.rows[0].id,leaseToken]);
      return {jobId:found.rows[0].id,userId:account.id,leaseToken};
    });
    if(result)return result;
  }
  return null;
}
export async function finishVisualReviewJob(job:{jobId:string;userId:string;leaseToken:string},success:boolean){
  const rows=await tenantQuery<{id:string}>(job.userId,`update knowledge_upload_job set visual_lease_token=null,visual_lease_until=null,
    visual_error_code=case when $4 then null else 'local-visual-preparation-failed' end,
    visual_retry_at=case when $4 or visual_attempts>=3 then null else now()+interval '5 minutes' end,updated_at=now()
    where id=$1 and user_id=$2 and visual_lease_token=$3 and visual_lease_until>now() returning id`,[job.jobId,job.userId,job.leaseToken,success]);
  return Boolean(rows[0]);
}
