-- Anonymous presentation of existing local evaluations; never upgrades their provenance.
create table if not exists agent_skill_blind_round (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references app_user(id),
 replay_id uuid, shadow_id uuid, artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 arm_order jsonb not null, created_at timestamptz not null default now(),
 unique(owner_id,id), unique(owner_id,replay_id), unique(owner_id,shadow_id),
 check(num_nonnulls(replay_id,shadow_id)=1),
 foreign key(owner_id,replay_id) references agent_skill_replay(owner_id,id),
 foreign key(owner_id,shadow_id) references agent_skill_shadow_job(owner_id,id)
);
create table if not exists agent_skill_blind_judgment (
 round_id uuid not null, owner_id uuid not null, revision integer not null check(revision>0),
 case_id text not null, pair_hash text not null check(pair_hash ~ '^[a-f0-9]{64}$'),
 judgment jsonb not null, reviewer_id uuid not null references app_user(id),
 reviewer_kind text not null check(reviewer_kind in('account-user','assistant-development')),
 created_at timestamptz not null default now(), primary key(round_id,revision),
 foreign key(owner_id,round_id) references agent_skill_blind_round(owner_id,id), check(reviewer_id=owner_id)
);
create table if not exists agent_skill_blind_disclosure (
 round_id uuid primary key, owner_id uuid not null, revision integer not null,
 created_at timestamptz not null default now(),
 foreign key(owner_id,round_id) references agent_skill_blind_round(owner_id,id),
 foreign key(round_id,revision) references agent_skill_blind_judgment(round_id,revision)
);
alter table agent_skill_blind_round enable row level security;
alter table agent_skill_blind_round force row level security;
alter table agent_skill_blind_judgment enable row level security;
alter table agent_skill_blind_judgment force row level security;
alter table agent_skill_blind_disclosure enable row level security;
alter table agent_skill_blind_disclosure force row level security;
create policy owned_read on agent_skill_blind_round for select using(owner_id=app_current_user_id());
create policy owned_insert on agent_skill_blind_round for insert with check(owner_id=app_current_user_id());
create policy owned_read on agent_skill_blind_judgment for select using(owner_id=app_current_user_id());
create policy owned_insert on agent_skill_blind_judgment for insert with check(owner_id=app_current_user_id() and reviewer_id=app_current_user_id());
revoke all on agent_skill_blind_round,agent_skill_blind_judgment from network_copilot_app;
grant select,insert on agent_skill_blind_round,agent_skill_blind_judgment to network_copilot_app;
create policy owned_read on agent_skill_blind_disclosure for select using(owner_id=app_current_user_id());
create policy owned_insert on agent_skill_blind_disclosure for insert with check(owner_id=app_current_user_id());
revoke all on agent_skill_blind_disclosure from network_copilot_app;
grant select,insert on agent_skill_blind_disclosure to network_copilot_app;
