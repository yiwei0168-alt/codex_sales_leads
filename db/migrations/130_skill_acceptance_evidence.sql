-- Evidence storage is not an activation grant. The production collector and final
-- provenance adapter must be implemented before changeSkill can consume it.
create table if not exists agent_skill_acceptance_bundle (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references app_user(id), skill_id uuid not null, version integer not null,
 source_kind text not null check(source_kind in('synthetic-fixture','production-runner-pending-verification')),
 plan jsonb not null, observations jsonb not null, raw_receipts jsonb not null,
 artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,id), unique(owner_id,artifact_hash),
 foreign key(owner_id,skill_id) references agent_skill(owner_id,id),
 foreign key(skill_id,version) references agent_skill_version(skill_id,version),
 check(jsonb_typeof(plan)='object' and jsonb_typeof(observations)='array' and jsonb_typeof(raw_receipts)='object'),
 check((plan->>'protocol') is not null and plan->>'protocol'='skill-acceptance-plan-v1'),
 check((plan->'pin'->>'ownerId') is not null and plan->'pin'->>'ownerId'=owner_id::text),
 check((plan->'pin'->>'skillId') is not null and plan->'pin'->>'skillId'=skill_id::text),
 check((plan->'pin'->>'version') is not null and plan->'pin'->>'version'=version::text)
);
create table if not exists agent_skill_acceptance_judgment (
 bundle_id uuid not null, owner_id uuid not null, case_id text not null,
 revision integer not null check(revision>0), reviewer_id uuid not null references app_user(id),
 reviewer_kind text not null check(reviewer_kind in('human','assistant-development')),
 observation_hash text not null check(observation_hash ~ '^[a-f0-9]{64}$'),
 judgment jsonb not null check(jsonb_typeof(judgment)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(bundle_id,case_id,revision),
 foreign key(owner_id,bundle_id) references agent_skill_acceptance_bundle(owner_id,id),
 check(reviewer_id=owner_id),
 check((judgment->>'caseId') is not null and judgment->>'caseId'=case_id),
 check((judgment->>'reviewerId') is not null and judgment->>'reviewerId'=reviewer_id::text),
 check((judgment->>'kind') is not null and judgment->>'kind'=reviewer_kind),
 check((judgment->>'revision') is not null and judgment->>'revision'=revision::text),
 check((judgment->>'observationHash') is not null and judgment->>'observationHash'=observation_hash)
);
create or replace function reject_skill_acceptance_rewrite() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Skill acceptance evidence is append-only'; end $$;
drop trigger if exists skill_acceptance_bundle_immutable on agent_skill_acceptance_bundle;
create trigger skill_acceptance_bundle_immutable before update or delete on agent_skill_acceptance_bundle
 for each row execute function reject_skill_acceptance_rewrite();
drop trigger if exists skill_acceptance_judgment_immutable on agent_skill_acceptance_judgment;
create trigger skill_acceptance_judgment_immutable before update or delete on agent_skill_acceptance_judgment
 for each row execute function reject_skill_acceptance_rewrite();
alter table agent_skill_acceptance_bundle enable row level security;
alter table agent_skill_acceptance_bundle force row level security;
alter table agent_skill_acceptance_judgment enable row level security;
alter table agent_skill_acceptance_judgment force row level security;
drop policy if exists owned_read on agent_skill_acceptance_bundle;
create policy owned_read on agent_skill_acceptance_bundle for select using(owner_id=app_current_user_id());
drop policy if exists owned_read on agent_skill_acceptance_judgment;
create policy owned_read on agent_skill_acceptance_judgment for select using(owner_id=app_current_user_id());
drop policy if exists owned_insert on agent_skill_acceptance_judgment;
create policy owned_insert on agent_skill_acceptance_judgment for insert with check(owner_id=app_current_user_id() and reviewer_id=app_current_user_id());
revoke all on agent_skill_acceptance_bundle,agent_skill_acceptance_judgment from public,network_copilot_app;
-- The normal application cannot upload or replace evaluator evidence. No public
-- evidence-ingestion SECURITY DEFINER function is provided by this migration.
grant select on agent_skill_acceptance_bundle to network_copilot_app;
grant select,insert on agent_skill_acceptance_judgment to network_copilot_app;
revoke all on function reject_skill_acceptance_rewrite() from public,network_copilot_app;
