-- MA10: asynchronously polled model jobs, separate from user action approvals.
alter table agent_run add column if not exists next_attempt_at timestamptz not null default now();
create unique index if not exists agent_tool_call_owner_id on agent_tool_call(user_id,id);
create table if not exists agent_model_batch (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, run_id uuid not null, call_id uuid not null,
  reservation_id uuid not null references paid_call_reservation(id),
  model text not null, provider text not null, custom_id text not null,
  remote_id text, status text not null check(status in('submitting','pending','completed','failed','unknown')),
  provider_status text, output jsonb, submitted_at timestamptz not null default now(),
  next_poll_at timestamptz not null default now(), poll_token uuid, poll_lease_until timestamptz,
  poll_count integer not null default 0, poll_failures integer not null default 0,
  http_latency_ms bigint not null default 0, finished_at timestamptz,
  unique(user_id,id),unique(user_id,call_id),unique(remote_id),
  foreign key(user_id,run_id) references agent_run(user_id,id),
  foreign key(user_id,call_id) references agent_tool_call(user_id,id)
);
alter table agent_model_batch enable row level security;
alter table agent_model_batch force row level security;
drop policy if exists tenant on agent_model_batch;
create policy tenant on agent_model_batch using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on agent_model_batch to network_copilot_app;
create index if not exists agent_model_batch_poll on agent_model_batch(next_poll_at) where status='pending';

create or replace function claim_next_agent_run(p_worker text)
returns table(id uuid,user_id uuid,lease_token uuid)
language sql security definer set search_path=pg_catalog,public as $$
  update public.agent_run r set status='running',worker_id=left(p_worker,120),
    lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
  where r.id=(select q.id from public.agent_run q join public.app_user u on u.id=q.user_id
    where u.status='active' and q.execution_version='main-agent-v1'
      and ((q.status='queued' and q.next_attempt_at<=now()) or (q.status='running' and q.lease_until<now()))
    order by q.created_at for update of q skip locked limit 1)
  returning r.id,r.user_id,r.lease_token;
$$;
revoke all on function claim_next_agent_run(text) from public;
grant execute on function claim_next_agent_run(text) to network_copilot_app;

-- Poll receipts even after task cancellation/account disable; this never submits work.
create or replace function claim_next_agent_model_batch(p_id uuid default null)
returns table(id uuid,user_id uuid,poll_token uuid)
language sql security definer set search_path=pg_catalog,public as $$
  update public.agent_model_batch b set poll_token=gen_random_uuid(),poll_lease_until=now()+interval '90 seconds'
  where b.id=(select q.id from public.agent_model_batch q
    where q.status='pending' and q.remote_id is not null and q.next_poll_at<=now()
      and (p_id is null or q.id=p_id) and (q.poll_lease_until is null or q.poll_lease_until<now())
    order by q.next_poll_at for update skip locked limit 1)
  returning b.id,b.user_id,b.poll_token;
$$;
revoke all on function claim_next_agent_model_batch(uuid) from public;
grant execute on function claim_next_agent_model_batch(uuid) to network_copilot_app;
