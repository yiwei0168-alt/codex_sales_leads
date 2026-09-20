-- Additive MA01/MA08 runtime. Private execution payloads are not telemetry.
create unique index if not exists assistant_conversation_owner_id on assistant_conversation(user_id,id);
create table if not exists agent_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  conversation_id uuid not null,
  request_key text not null,
  request_hash text not null,
  execution_version text not null default 'main-agent-v1',
  status text not null default 'queued' check(status in('queued','running','waiting_user','paused','partial','completed','failed','cancelled')),
  input jsonb not null,
  result jsonb,
  control text check(control in('pause','cancel')),
  instructions jsonb not null default '[]',
  worker_id text,
  lease_token uuid,
  lease_until timestamptz,
  model_config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,request_key),
  foreign key(user_id,conversation_id) references assistant_conversation(user_id,id)
);
create index if not exists agent_run_claim on agent_run(status,lease_until,created_at);
create table if not exists agent_run_event (
  id bigserial primary key,
  user_id uuid not null,
  run_id uuid not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(user_id,run_id) references agent_run(user_id,id)
);
create index if not exists agent_run_event_cursor on agent_run_event(user_id,run_id,id);
create table if not exists agent_tool_call (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  run_id uuid not null,
  call_key text not null,
  tool_id text not null,
  tool_version text not null,
  input_hash text not null,
  input jsonb not null,
  effect text not null,
  status text not null check(status in('started','completed','unknown')),
  output jsonb,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,run_id,call_key),
  foreign key(user_id,run_id) references agent_run(user_id,id)
);
do $$ declare t text; begin
  foreach t in array array['agent_run','agent_run_event','agent_tool_call'] loop
    execute format('alter table %I enable row level security',t);
    execute format('alter table %I force row level security',t);
    execute format('drop policy if exists tenant on %I',t);
    execute format('create policy tenant on %I using(user_id=app_current_user_id()) with check(user_id=app_current_user_id())',t);
    execute format('grant select,insert,update on %I to network_copilot_app',t);
  end loop;
end $$;
revoke update on agent_run_event from network_copilot_app;
grant usage on sequence agent_run_event_id_seq to network_copilot_app;

-- Only the server worker calls this function. Expired leases receive a new fence token.
create or replace function claim_next_agent_run(p_worker text)
returns table(id uuid,user_id uuid,lease_token uuid)
language sql security definer set search_path=pg_catalog,public as $$
  update public.agent_run r set status='running',worker_id=left(p_worker,120),
    lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
  where r.id=(select q.id from public.agent_run q join public.app_user u on u.id=q.user_id
    where u.status='active' and q.execution_version='main-agent-v1'
      and (q.status='queued' or (q.status='running' and q.lease_until<now()))
    order by q.created_at for update of q skip locked limit 1)
  returning r.id,r.user_id,r.lease_token;
$$;
revoke all on function claim_next_agent_run(text) from public;
grant execute on function claim_next_agent_run(text) to network_copilot_app;
