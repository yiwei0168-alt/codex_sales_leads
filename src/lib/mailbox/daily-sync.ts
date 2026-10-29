import {tenantQuery,tenantTransaction} from '@/lib/rag/db';

/** Fixed business timezone, independent of the server or browser timezone. */
export function nextDailySync(now=new Date()){
 const local=new Date(now.getTime()+8*3600000);
 const day=local.toISOString().slice(0,10);
 const candidate=new Date(`${day}T08:00:00+08:00`);
 return new Date(candidate.getTime()+(candidate<=now?86400000:0)).toISOString();
}
export async function readDailySync(userId:string){
 return tenantQuery(userId,`select d.connection_id,d.enabled,d.next_run_at::text,d.last_job_id,
  j.status as last_status,j.error as last_error from mailbox_daily_sync d
  left join mailbox_work_job j on j.id=d.last_job_id and j.user_id=d.user_id where d.user_id=$1`,[userId]);
}
export async function setDailySync(userId:string,connectionId:string,enabled:boolean){
 return tenantTransaction(userId,async client=>{
  // Same lock order as the scheduler: schedule first, then connection.
  await client.query('select connection_id from mailbox_daily_sync where user_id=$1 and connection_id=$2 for update',[userId,connectionId]);
  const connection=await client.query("select id from mailbox_connection where user_id=$1 and id=$2 and status='active' for update",[userId,connectionId]);
  if(!connection.rowCount)throw Error('邮箱未连接或不属于当前账号');
  await client.query(`insert into mailbox_daily_sync(user_id,connection_id,enabled,next_run_at) values($1,$2,$3,$4)
   on conflict(connection_id) do update set enabled=$3,
    next_run_at=case when mailbox_daily_sync.enabled=$3 then mailbox_daily_sync.next_run_at else $4::timestamptz end,updated_at=now()
   where mailbox_daily_sync.user_id=$1`,[userId,connectionId,enabled,nextDailySync()]);
  if(!enabled)await client.query(`update mailbox_work_job set status='cancelled',updated_at=now()
   where user_id=$1 and target_id=$2 and kind='sync' and status='queued' and payload->>'automatic'='true'`,[userId,connectionId]);
  return {enabled};
 });
}
