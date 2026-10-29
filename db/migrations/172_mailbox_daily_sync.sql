-- Opt-in per connection. Missed dates are queued one at a time, with frozen ranges.
create table if not exists mailbox_daily_sync (
 connection_id uuid primary key references mailbox_connection(id) on delete cascade,
 user_id uuid not null references app_user(id), enabled boolean not null default false,
 next_run_at timestamptz not null, last_job_id uuid references mailbox_work_job(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table mailbox_daily_sync enable row level security;
alter table mailbox_daily_sync force row level security;
drop policy if exists mailbox_daily_sync_owner on mailbox_daily_sync;
create policy mailbox_daily_sync_owner on mailbox_daily_sync
 using(user_id=app_current_user_id()) with check(user_id=app_current_user_id()
 and exists(select 1 from mailbox_connection c where c.id=connection_id and c.user_id=app_current_user_id()));
grant select,insert,update,delete on mailbox_daily_sync to network_copilot_app;
create or replace function enqueue_due_mailbox_daily_sync() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s record; job uuid; day text; n integer:=0;
begin
 for s in select d.* from public.mailbox_daily_sync d
 join public.mailbox_connection c on c.id=d.connection_id and c.user_id=d.user_id
 join public.app_user u on u.id=d.user_id
 where d.enabled and d.next_run_at<=now() and c.status='active' and u.status='active'
 order by d.next_run_at for update of d skip locked limit 20
 loop
  -- Same lock as manual admission: an active sync delays this date, never drops it.
  perform 1 from public.mailbox_connection where id=s.connection_id and user_id=s.user_id for update;
  day:=to_char((s.next_run_at at time zone 'Asia/Shanghai')::date-1,'YYYY-MM-DD');
  job:=null;
  insert into public.mailbox_work_job(user_id,kind,target_id,payload)
  values(s.user_id,'sync',s.connection_id,jsonb_build_object('connectionId',s.connection_id,
   'folderScope','both','from',day,'through',day,'timeZone','Asia/Shanghai','automatic',true))
  on conflict(user_id,kind,target_id) where status in ('queued','running','uncertain') do nothing returning id into job;
  if job is not null then
   update public.mailbox_daily_sync set next_run_at=s.next_run_at+interval '1 day',last_job_id=job,updated_at=now()
    where connection_id=s.connection_id and user_id=s.user_id;
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;
revoke all on function enqueue_due_mailbox_daily_sync() from public;
grant execute on function enqueue_due_mailbox_daily_sync() to network_copilot_app;
