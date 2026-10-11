-- Historical local replay evidence only; no row grants automatic activation.
create table if not exists agent_skill_replay (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_user(id),
  skill_id uuid not null, version integer not null,
  snapshot jsonb not null, result jsonb not null,
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  kind text not null default 'local-historical-replay' check(kind='local-historical-replay'),
  created_at timestamptz not null default now(),
  unique(owner_id,id), unique(owner_id,artifact_hash),
  foreign key(owner_id,skill_id) references agent_skill(owner_id,id),
  foreign key(skill_id,version) references agent_skill_version(skill_id,version)
);
create table if not exists agent_skill_replay_review (
  replay_id uuid not null, owner_id uuid not null,
  revision integer not null check(revision>0),
  reviewer_id uuid not null references app_user(id),
  review jsonb not null, grade jsonb not null,
  created_at timestamptz not null default now(),
  primary key(replay_id,revision),
  foreign key(owner_id,replay_id) references agent_skill_replay(owner_id,id),
  check(reviewer_id=owner_id)
);
alter table agent_skill_replay enable row level security;
alter table agent_skill_replay force row level security;
alter table agent_skill_replay_review enable row level security;
alter table agent_skill_replay_review force row level security;
drop policy if exists owned_read on agent_skill_replay;
create policy owned_read on agent_skill_replay for select using(owner_id=app_current_user_id());
drop policy if exists owned_insert on agent_skill_replay;
create policy owned_insert on agent_skill_replay for insert with check(owner_id=app_current_user_id()
  and exists(select 1 from agent_skill s where s.id=skill_id and s.owner_id=app_current_user_id() and s.scope='account'));
drop policy if exists owned_read on agent_skill_replay_review;
create policy owned_read on agent_skill_replay_review for select using(owner_id=app_current_user_id());
drop policy if exists owned_insert on agent_skill_replay_review;
create policy owned_insert on agent_skill_replay_review for insert with check(owner_id=app_current_user_id() and reviewer_id=app_current_user_id());
revoke all on agent_skill_replay,agent_skill_replay_review from network_copilot_app;
grant select,insert on agent_skill_replay,agent_skill_replay_review to network_copilot_app;
