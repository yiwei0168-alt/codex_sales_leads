create table if not exists agent_skill_shadow_review (
 job_id uuid not null, owner_id uuid not null, revision integer not null check(revision>0),
 reviewer_id uuid not null references app_user(id),
 artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 review jsonb not null, grade jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(job_id,revision),
 foreign key(owner_id,job_id) references agent_skill_shadow_job(owner_id,id),
 check(reviewer_id=owner_id)
);
alter table agent_skill_shadow_review enable row level security;
alter table agent_skill_shadow_review force row level security;
drop policy if exists owned_read on agent_skill_shadow_review;
create policy owned_read on agent_skill_shadow_review for select using(owner_id=app_current_user_id());
drop policy if exists owned_insert on agent_skill_shadow_review;
create policy owned_insert on agent_skill_shadow_review for insert with check(owner_id=app_current_user_id() and reviewer_id=app_current_user_id());
revoke all on agent_skill_shadow_review from public,network_copilot_app;
grant select,insert on agent_skill_shadow_review to network_copilot_app;
