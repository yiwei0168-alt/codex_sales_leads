create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references app_user(id),
  scope text not null check(scope in('account','global')), kind text not null check(kind in('preference','policy','company-decision')),
  memory_key text not null, mandatory boolean not null default false, active boolean not null default true,
  current_version integer not null default 1, source_kind text not null check(source_kind in('automatic','explicit')),
  market_codes text[] not null default '{}', company_ids text[] not null default '{}',
  valid_from timestamptz not null default now(), valid_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,scope,kind,memory_key), check(not mandatory or (scope='global' and kind='policy')),
  check(valid_until is null or valid_until>valid_from)
);
create table if not exists agent_memory_version (
  memory_id uuid not null references agent_memory(id), version integer not null,
  content text not null, scope_snapshot jsonb not null, source_run_id uuid references agent_run(id), source_message_id uuid references assistant_message(id),
  created_at timestamptz not null default now(), primary key(memory_id,version)
);
alter table agent_memory enable row level security;
alter table agent_memory force row level security;
drop policy if exists memory_read on agent_memory;
create policy memory_read on agent_memory for select using(owner_id=app_current_user_id() or scope='global');
drop policy if exists memory_write on agent_memory;
create policy memory_write on agent_memory for all using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id() and (scope='account' or app_current_user_role()='admin'));
alter table agent_memory_version enable row level security;
alter table agent_memory_version force row level security;
drop policy if exists memory_version_read on agent_memory_version;
create policy memory_version_read on agent_memory_version for select using(exists(select 1 from agent_memory m where m.id=memory_id));
drop policy if exists memory_version_write on agent_memory_version;
create policy memory_version_write on agent_memory_version for insert with check(exists(select 1 from agent_memory m where m.id=memory_id and m.owner_id=app_current_user_id()));
grant select,insert,update on agent_memory to network_copilot_app;
grant select,insert on agent_memory_version to network_copilot_app;
