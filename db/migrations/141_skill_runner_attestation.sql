-- G09 only: depends on Skill schema through 135, not MA24 evaluation migrations 136-140.
-- A stored signature is not an activation grant or proof of runtime/provider equivalence.
create table if not exists agent_skill_runner_attestation (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,
 bundle_id uuid not null,freeze_id uuid not null,
 artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
 statement_hash text not null check(statement_hash ~ '^[a-f0-9]{64}$'),
 envelope jsonb not null check(jsonb_typeof(envelope)='object'),
 created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,bundle_id,statement_hash),
 foreign key(owner_id,bundle_id) references agent_skill_acceptance_bundle(owner_id,id),
 foreign key(owner_id,freeze_id) references agent_skill_acceptance_freeze(owner_id,id),
 check((envelope->'statement'->>'ownerId') is not null and envelope->'statement'->>'ownerId'=owner_id::text),
 check((envelope->'statement'->>'freezeId') is not null and envelope->'statement'->>'freezeId'=freeze_id::text),
 check((envelope->'statement'->>'artifactHash') is not null and envelope->'statement'->>'artifactHash'=artifact_hash)
);
drop trigger if exists skill_runner_attestation_immutable on agent_skill_runner_attestation;
create trigger skill_runner_attestation_immutable before update or delete on agent_skill_runner_attestation
 for each row execute function reject_skill_acceptance_rewrite();
alter table agent_skill_runner_attestation enable row level security;
alter table agent_skill_runner_attestation force row level security;
drop policy if exists owned_read on agent_skill_runner_attestation;
create policy owned_read on agent_skill_runner_attestation for select using(owner_id=app_current_user_id());
drop policy if exists collector_insert on agent_skill_runner_attestation;
create policy collector_insert on agent_skill_runner_attestation for insert to network_copilot_skill_collector
 with check(owner_id=app_current_user_id());
revoke all on agent_skill_runner_attestation from public,network_copilot_app,network_copilot_skill_collector;
grant select on agent_skill_runner_attestation to network_copilot_app;
grant select,insert on agent_skill_runner_attestation to network_copilot_skill_collector;
