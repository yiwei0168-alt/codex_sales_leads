create table if not exists agent_approval (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  run_id uuid not null,
  tool_id text not null,
  tool_version text not null,
  parameter_hash text not null,
  payload jsonb not null,
  status text not null default 'pending' check(status in('pending','approved','denied','revoked','consumed','expired')),
  expires_at timestamptz not null default now()+interval '24 hours',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,run_id,tool_id,tool_version,parameter_hash),
  foreign key(user_id,run_id) references agent_run(user_id,id)
);
alter table agent_approval enable row level security;
alter table agent_approval force row level security;
drop policy if exists tenant on agent_approval;
create policy tenant on agent_approval using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update on agent_approval to network_copilot_app;
alter table agent_tool_call add column if not exists approval_id uuid references agent_approval(id);
create unique index if not exists agent_call_approval_once on agent_tool_call(approval_id) where approval_id is not null;
