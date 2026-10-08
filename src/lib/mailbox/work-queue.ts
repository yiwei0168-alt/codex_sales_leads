import { query,tenantQuery,tenantTransaction } from "@/lib/rag/db";
import { reviewMailboxMessageForLearning,syncAliMail } from "./service";
import { mailboxSyncSchema } from "./sync-options";

export async function enqueueLearning(userId:string,ids:string[]) {
  return tenantTransaction(userId,async client=>{
    const messages=await client.query<{id:string;content_sha256:string}>(`select id,content_sha256 from mailbox_message
      where user_id=$1 and id=any($2::uuid[]) and learning_status in ('pending','failed')
      and not coalesce((metadata->>'rawContentPurged')::boolean,false) for update`,[userId,ids]);
    if(messages.rowCount!==ids.length)throw new Error("部分邮件已处理、已删除或不属于当前账号，请刷新选择");
    const jobs=[];
    for(const m of messages.rows){
      const inserted=await client.query<{id:string}>(`insert into mailbox_work_job(user_id,kind,target_id,payload)
        values($1,'learn',$2,$3) on conflict(user_id,kind,target_id) where status in ('queued','running','uncertain')
        do update set updated_at=mailbox_work_job.updated_at returning id`,[userId,m.id,JSON.stringify({consent:true,contentSha256:m.content_sha256})]);
      jobs.push(inserted.rows[0].id);
    }
    return {queued:jobs.length,jobIds:jobs};
  });
}
export async function enqueueSync(userId:string,input:unknown){
  const options=mailboxSyncSchema.parse(input);
  // Freeze the range so resumptions do not move the date boundary.
  options.from??=new Date(Date.now()-(options.lookbackDays??180)*86400000).toISOString().slice(0,10);
  options.through??=new Date().toISOString().slice(0,10);
  return tenantTransaction(userId,async client=>{
    const connection=await client.query("select id from mailbox_connection where user_id=$1 and id=$2 and status='active' for update",[userId,options.connectionId]);
    if(!connection.rowCount)throw new Error("邮箱未连接");
    const jobs=await client.query<{id:string}>(`insert into mailbox_work_job(user_id,kind,target_id,payload) values($1,'sync',$2,$3)
      on conflict(user_id,kind,target_id) where status in ('queued','running','uncertain') do nothing returning id`,[userId,options.connectionId,JSON.stringify(options)]);
    if(!jobs.rowCount)throw new Error("该邮箱已有同步任务，请等待完成");
    return {queued:1,jobId:jobs.rows[0].id};
  });
}
export async function mailboxJobs(userId:string){
  return tenantQuery(userId,`select id,kind,status,result,error,created_at,updated_at from mailbox_work_job
    where user_id=$1 order by created_at desc limit 100`,[userId]);
}
export async function processMailboxWork(){
  const job=(await query<{id:string;user_id:string;lease_token:string}>("select * from claim_mailbox_work()"))[0];
  if(!job)return false;
  const params=[job.user_id,job.id,job.lease_token];
  const [row]=await tenantQuery<{kind:string;target_id:string;payload:Record<string,unknown>}>(job.user_id,
    "select kind,target_id,payload from mailbox_work_job where user_id=$1 and id=$2 and lease_token=$3 and status='running'",params);
  if(!row)return true;
  const heartbeat=setInterval(()=>void tenantQuery(job.user_id,`update mailbox_work_job set lease_until=now()+interval '90 seconds'
    where user_id=$1 and id=$2 and lease_token=$3 and status='running'`,params).catch(()=>undefined),20000);
  try{
    let result:unknown;
    if(row.kind==='learn'){
      const [m]=await tenantQuery<{content_sha256:string}>(job.user_id,"select content_sha256 from mailbox_message where user_id=$1 and id=$2",[job.user_id,row.target_id]);
      if(!m||m.content_sha256!==row.payload.contentSha256||row.payload.consent!==true)throw new Error("授权原文已变化或删除，请重新核对");
      result=await reviewMailboxMessageForLearning(job.user_id,row.target_id,'authorize');
    }else{
      const options=mailboxSyncSchema.parse(row.payload);
      const totals={imported:0,discovered:0};
      // Each page is committed; retry skips stored messages within the frozen range.
      for(;;){
        const state=await tenantQuery(job.user_id,"select id from mailbox_work_job where user_id=$1 and id=$2 and lease_token=$3 and status='running' and lease_until>now()",params);
        if(!state.length)throw new Error("任务已停止");
        const page=await syncAliMail(job.user_id,row.target_id,options);
        totals.imported+=page.imported;totals.discovered=page.discovered;
        await tenantQuery(job.user_id,"update mailbox_work_job set result=$4,updated_at=now() where user_id=$1 and id=$2 and lease_token=$3 and status='running'",[...params,JSON.stringify(totals)]);
        if(page.imported===0){if(page.discovered>0)throw new Error("部分邮件解析失败，保留已导入结果，请检查后重试");break;}
      }
      result=totals;
    }
    await tenantQuery(job.user_id,"update mailbox_work_job set status='completed',result=$4,error=null,updated_at=now() where user_id=$1 and id=$2 and lease_token=$3 and status='running'",[...params,JSON.stringify(result)]);
  }catch(error){
    // Provider transport failures are conservatively held for receipt reconciliation.
    await tenantQuery(job.user_id,"update mailbox_work_job set status=$4,error=$5,updated_at=now() where user_id=$1 and id=$2 and lease_token=$3 and status='running'",[...params,row.kind==='learn'?'uncertain':'failed',error instanceof Error?error.message:'处理失败']);
  }finally{clearInterval(heartbeat);}
  return true;
}
