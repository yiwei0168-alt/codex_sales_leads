alter table app_user add column if not exists timezone text not null default 'Asia/Shanghai';
create table if not exists agent_schedule (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_user(id),
  title text not null, content text not null, timezone text not null, plan jsonb not null,
  enabled boolean not null default true, version integer not null default 1,
  next_run_at timestamptz not null, active_run_id uuid,
  lease_token uuid, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(user_id,active_run_id) references agent_run(user_id,id)
);
alter table agent_schedule enable row level security;
alter table agent_schedule force row level security;
drop policy if exists tenant on agent_schedule;
create policy tenant on agent_schedule using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on agent_schedule to network_copilot_app;
create or replace function claim_next_agent_schedule(p_schedule_id uuid default null)
returns table(id uuid,user_id uuid,lease_token uuid)
language sql security definer set search_path=pg_catalog,public as $$
  update public.agent_schedule s set lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds'
    where s.id=(select q.id from public.agent_schedule q join public.app_user u on u.id=q.user_id
      where (p_schedule_id is null or q.id=p_schedule_id) and q.enabled and u.status='active' and q.next_run_at<=now() and (q.lease_until is null or q.lease_until<now())
        and not exists(select 1 from public.agent_run r where r.id=q.active_run_id and r.status in('queued','running','waiting_user','paused','partial'))
      order by q.next_run_at for update of q skip locked limit 1)
    returning s.id,s.user_id,s.lease_token;
$$;
revoke all on function claim_next_agent_schedule(uuid) from public;
grant execute on function claim_next_agent_schedule(uuid) to network_copilot_app;
