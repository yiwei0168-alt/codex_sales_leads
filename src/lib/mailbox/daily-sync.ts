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
  j.status as last_status,j.error as last_error,
  gaps.uncovered_failed_days,gaps.first_uncovered_day,gaps.last_uncovered_day
  from mailbox_daily_sync d
  left join mailbox_work_job j on j.id=d.last_job_id and j.user_id=d.user_id
  cross join lateral (
   select count(distinct f.payload->>'from')::int as uncovered_failed_days,
    min(f.payload->>'from') as first_uncovered_day,max(f.payload->>'from') as last_uncovered_day
   from mailbox_work_job f
   where f.user_id=d.user_id and f.target_id=d.connection_id and f.kind='sync' and f.status='failed'
    and f.payload->>'automatic'='true' and f.payload->>'timeZone'='Asia/Shanghai'
    and f.payload->>'folderScope'='both' and f.payload->>'from'=f.payload->>'through'
    and not exists (
     select 1 from mailbox_work_job done
     where done.user_id=f.user_id and done.target_id=f.target_id and done.kind='sync' and done.status='completed'
      and done.updated_at>=f.created_at and done.payload->>'timeZone'='Asia/Shanghai'
      and done.payload->>'folderScope'='both' and done.payload->>'from'<=f.payload->>'from'
      and done.payload->>'through'>=f.payload->>'through'
    )
  ) gaps where d.user_id=$1`,[userId]);
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
