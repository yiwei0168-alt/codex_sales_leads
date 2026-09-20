create table if not exists agent_skill (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references app_user(id),
  name text not null, scope text not null check(scope in('account','global')),
  enabled boolean not null default true, published boolean not null default false,
  current_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,id)
);
create table if not exists agent_skill_version (
  skill_id uuid not null references agent_skill(id), version integer not null,
  content_hash text not null, source text not null, files jsonb not null, dependencies jsonb not null default '[]',
  validation jsonb not null, created_at timestamptz not null default now(),
  primary key(skill_id,version)
);
create table if not exists agent_run_skill (
  user_id uuid not null, run_id uuid not null, skill_id uuid not null, version integer not null,
  primary key(user_id,run_id,skill_id),
  foreign key(user_id,run_id) references agent_run(user_id,id),
  foreign key(skill_id,version) references agent_skill_version(skill_id,version)
);
alter table agent_skill enable row level security;
alter table agent_skill force row level security;
drop policy if exists skill_read on agent_skill;
create policy skill_read on agent_skill for select using(owner_id=app_current_user_id() or (scope='global' and published)
  or exists(select 1 from agent_run_skill p where p.skill_id=id and p.user_id=app_current_user_id()));
drop policy if exists skill_insert on agent_skill;
create policy skill_insert on agent_skill for insert with check(owner_id=app_current_user_id() and (scope='account' or app_current_user_role()='admin'));
drop policy if exists skill_update on agent_skill;
create policy skill_update on agent_skill for update using(owner_id=app_current_user_id()) with check(owner_id=app_current_user_id() and (scope='account' or app_current_user_role()='admin'));
alter table agent_skill_version enable row level security;
alter table agent_skill_version force row level security;
drop policy if exists skill_version_read on agent_skill_version;
create policy skill_version_read on agent_skill_version for select using(exists(select 1 from agent_skill s where s.id=skill_id and (s.owner_id=app_current_user_id() or (s.scope='global' and s.published)))
  or exists(select 1 from agent_run_skill p where p.skill_id=agent_skill_version.skill_id and p.version=agent_skill_version.version and p.user_id=app_current_user_id()));
drop policy if exists skill_version_insert on agent_skill_version;
create policy skill_version_insert on agent_skill_version for insert with check(exists(select 1 from agent_skill s where s.id=skill_id and s.owner_id=app_current_user_id()));
alter table agent_run_skill enable row level security;
alter table agent_run_skill force row level security;
drop policy if exists tenant on agent_run_skill;
create policy tenant on agent_run_skill for select using(user_id=app_current_user_id());
drop policy if exists pin_insert on agent_run_skill;
create policy pin_insert on agent_run_skill for insert with check(user_id=app_current_user_id()
  and exists(select 1 from agent_skill s where s.id=skill_id and s.enabled and s.current_version=version and (s.owner_id=app_current_user_id() or (s.scope='global' and s.published))));
grant select,insert,update on agent_skill to network_copilot_app;
grant select,insert on agent_skill_version,agent_run_skill to network_copilot_app;
